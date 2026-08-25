# Mess Hall

A customizable meal planning app — plan your week, track nutrition, and generate a consolidated grocery list, all in the browser.

!\[Mess Hall weekly loadout grid](screenshot.png)

## The problem

Grocery shopping always felt harder than it should be — I'd stand in the store trying to plan a week of meals without any real sense of how many servings a recipe actually made, or how many days a batch of food would realistically carry me before I had to shop again. I wanted something closer to a "cart" for recipes: pick what you're cooking, drag each serving onto the day you'll eat it, and let the app tell you exactly how covered you are for the week — then build the shopping list for you automatically, with overlapping ingredients across recipes merged into one line instead of duplicated.

## What it does

* **Armory** — a personal recipe backlog. Add recipes manually, or paste a link and have it parsed automatically from the page's structured recipe data.
* **Loadout Builder** — a full weekly grid (breakfast/lunch/dinner + optional snacks) you fill either by dragging a serving token from your recipe pool onto a day, or by tapping an empty slot and picking from a quick menu.
* **Nutrition Dashboard** — customizable stat tiles (calories, protein, macros, and more) plus per-day nutrient rows you can configure independently of the summary tiles.
* **Supply List** — auto-generated from your confirmed week, with duplicate ingredients across recipes consolidated into single line items. You can also add your own items by hand — a running list, not just a recipe byproduct.
* **Ingredient info popovers** — tap the info icon next to any grocery item for its store aisle, common brand names, alternate names, shelf life, and a substitute suggestion.

## Tech stack

* Vanilla JavaScript, HTML5, CSS3 — no framework, no build step
* `localStorage` for persistence (all data currently lives in-browser, per device)
* HTML5 Drag and Drop API for the loadout grid interactions
* Client-side recipe link parsing: fetches the target page through a CORS proxy, then extracts `schema.org/Recipe` structured data (the same markup most recipe sites use for Google's rich snippets)

## Live demo

*\[Try it live](https://joyful-trifle-5f439a.netlify.app/)*

## What I'd do differently / what's next

This started as a fast prototype and is still evolving. The current biggest limitation is that data is local to whichever browser/device you're using — no sync between devices yet. That, along with more reliable recipe parsing (the CORS proxy approach is a workaround, not a permanent solution), is the next major piece of work.

