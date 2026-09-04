// netlify/functions/parse-recipe.js
//
// Server-side proxy for GPT-4o-mini recipe parsing.
// The OpenAI API key lives only here (as a Netlify env var), never in the browser.
//
// Frontend calls: POST /.netlify/functions/parse-recipe   body: { "url": "https://..." }
// Returns: the parsed recipe JSON (matching the schema below) or an error.

const SYSTEM_PROMPT = `You are a recipe data extraction engine. You will be given raw text scraped from a recipe webpage. Extract the recipe and output ONLY a single JSON object matching the schema below — no markdown code fences, no explanation, no text before or after the JSON.

Schema:
{
  "title": string,
  "servings": number,
  "prepTime": number,
  "mealType": array, one or more of ["Breakfast","Lunch","Dinner","Snack"],
  "cuisine": string or null,
  "nutritionPerServing": {
    "calories": number or null,
    "protein": number or null,
    "carbs": number or null,
    "fat": number or null,
    "fiber": number or null
  },
  "ingredients": [
    {
      "qty": number or null,
      "unit": one of ["g","kg","ml","l","tsp","tbsp","cup","fl_oz","oz","lb","pinch"] or null,
      "name": string,
      "category": one of ["Produce","Protein","Dairy","Bakery","Pantry","Other"]
    }
  ],
  "steps": array of strings
}

Rules:
1. Units — convert every ingredient quantity into one of the listed units. Example: "1 stick of butter" becomes 113 g or 8 tbsp; "a splash of milk" becomes a reasonable small tsp/tbsp estimate.
2. Fractions become decimals (e.g. "1/2 cup" becomes 0.5, unit "cup").
3. Whole/countable items (eggs, onions, chicken breasts) get unit null, with the count folded into "name" (e.g. "2 large eggs").
4. "category" must be exactly one of the five listed values. Default to "Other" only if genuinely ambiguous.
5. "mealType" — infer from context if not stated outright (e.g. eggs + bacon + toast implies Breakfast). Include more than one type if the recipe genuinely fits several.
6. Nutrition — first, look for nutrition facts explicitly stated on the page. If none are given, do NOT just sum the raw ingredients — instead, estimate based on what a typical, well-known version of this dish looks like nutritionally (the kind of estimate you'd give if asked "what's the nutrition on a standard [dish name]"), then adjust for any unusual quantities or substitutions in this specific recipe. Only fall back to pure ingredient-by-ingredient calculation if the dish is too unusual or specific to compare to anything typical. Never default to 0 or null unless the text is too incomplete to estimate from at all.
7. "prepTime" — use total time in minutes. If the page lists prep and cook time separately, add them together.
8. If the provided text is not a recipe at all, return {"error": "not a recipe"} instead of guessing.`;

// Strip a webpage down to plain, readable-ish text.
// Crude on purpose — GPT doesn't need clean HTML, just the words.
function extractReadableText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let url;
  try {
    const body = JSON.parse(event.body || "{}");
    url = (body.url || "").trim();
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  if (!url || !/^https?:\/\//i.test(url)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "A valid recipe URL is required" }) };
  }

  // Step 1: fetch the page server-side (no CORS restrictions here)
  let pageText;
  try {
    const pageResp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MessHallBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!pageResp.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: `Couldn't fetch that page (status ${pageResp.status})` }) };
    }
    const html = await pageResp.text();
    pageText = extractReadableText(html).slice(0, 15000); // keep the prompt a reasonable size
    if (pageText.length < 100) {
      return { statusCode: 422, headers, body: JSON.stringify({ error: "That page didn't have enough readable text to parse" }) };
    }
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Couldn't reach that URL — check the link and try again" }) };
  }

  // Step 2: send the scraped text to GPT-4o-mini for extraction
  let aiData;
  try {
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Recipe page text:\n${pageText}` },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("OpenAI API error:", aiResp.status, errText);
      return { statusCode: 502, headers, body: JSON.stringify({ error: "The AI parser is temporarily unavailable" }) };
    }

    const aiJson = await aiResp.json();
    const content = aiJson.choices && aiJson.choices[0] && aiJson.choices[0].message && aiJson.choices[0].message.content;
    if (!content) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "The AI parser returned an empty response" }) };
    }
    aiData = JSON.parse(content);
  } catch (err) {
    console.error("Recipe parse error:", err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Something went wrong while parsing the recipe" }) };
  }

  // Step 3: surface the model's own "not a recipe" signal instead of saving garbage
  if (aiData.error) {
    return { statusCode: 422, headers, body: JSON.stringify({ error: "That page doesn't look like a recipe" }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify(aiData) };
};
