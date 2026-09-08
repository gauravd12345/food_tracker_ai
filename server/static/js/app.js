const fileInput = document.getElementById("file-input");
const dropTarget = document.getElementById("drop-target");
const dropzone = document.getElementById("upload-form");
const previewWrap = document.getElementById("preview-wrap");
const preview = document.getElementById("preview");
const clearBtn = document.getElementById("clear-btn");
const resultIdle = document.getElementById("result-idle");
const resultBody = document.getElementById("result-body");
const resultLabel = document.getElementById("result-label");
const resultConfidence = document.getElementById("result-confidence");
const topk = document.getElementById("topk");
const resultError = document.getElementById("result-error");
const resultLoading = document.getElementById("result-loading");
const classGrid = document.getElementById("class-grid");
const sampleHint = document.getElementById("sample-hint");
const confirmForm = document.getElementById("confirm-form");
const customClass = document.getElementById("custom-class");
const confirmStatus = document.getElementById("confirm-status");
const pantryList = document.getElementById("pantry-list");
const pantryEmpty = document.getElementById("pantry-empty");
const pantryStatus = document.getElementById("pantry-status");
const suggestBtn = document.getElementById("suggest-btn");
const clearPantryBtn = document.getElementById("clear-pantry-btn");
const recipesSection = document.getElementById("recipes-section");
const recipesGrid = document.getElementById("recipes-grid");
const recipesLede = document.getElementById("recipes-lede");
const carouselViewport = document.getElementById("carousel-viewport");
const carouselCount = document.getElementById("carousel-count");
const prevRecipeBtn = document.getElementById("prev-recipe");
const nextRecipeBtn = document.getElementById("next-recipe");

let knownClasses = [];
let latestPrediction = null;
let pantryItems = [];
let recipeQueue = [];
let recipeIndex = 0;
let dragState = null;
let carouselBound = false;

const SWIPE_THRESHOLD = 70;

function setState({ loading = false, error = null, data = null } = {}) {
  resultIdle.hidden = loading || Boolean(error) || Boolean(data);
  resultLoading.hidden = !loading;
  resultError.hidden = !error;
  resultBody.hidden = !data;
  if (error) resultError.textContent = error;
}

function setPantryStatus(message, isError = false) {
  if (!message) {
    pantryStatus.hidden = true;
    pantryStatus.textContent = "";
    return;
  }
  pantryStatus.hidden = false;
  pantryStatus.textContent = message;
  pantryStatus.classList.toggle("is-error", isError);
}

function renderPantry() {
  const hasItems = pantryItems.length > 0;
  pantryEmpty.hidden = hasItems;
  pantryList.hidden = !hasItems;
  suggestBtn.disabled = !hasItems;
  clearPantryBtn.disabled = !hasItems;
  pantryList.innerHTML = "";

  for (const item of pantryItems) {
    const li = document.createElement("li");
    li.className = "pantry-item";

    const name = document.createElement("span");
    name.textContent = item.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "pantry-remove";
    remove.setAttribute("aria-label", `Remove ${item.name}`);
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removePantryItem(item.id));

    li.append(name, remove);
    pantryList.appendChild(li);
  }
}

async function refreshPantry() {
  const res = await fetch("/api/pantry");
  const data = await res.json();
  pantryItems = data.items || [];
  renderPantry();
}

async function removePantryItem(itemId) {
  setPantryStatus("");
  const res = await fetch(`/api/pantry/items/${itemId}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setPantryStatus(data.detail || "Could not remove ingredient.", true);
    return;
  }
  pantryItems = data.items || [];
  renderPantry();
}

async function clearPantry() {
  setPantryStatus("");
  const res = await fetch("/api/pantry", { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setPantryStatus(data.detail || "Could not clear pantry.", true);
    return;
  }
  pantryItems = [];
  renderPantry();
  recipesSection.hidden = true;
  recipesGrid.innerHTML = "";
  recipeQueue = [];
  recipeIndex = 0;
  updateCarousel();
}

function renderResult(data) {
  latestPrediction = data;
  resultLabel.textContent = data.display_name;
  resultConfidence.textContent = `${Math.round(data.confidence * 100)}% confidence`;
  topk.innerHTML = "";
  for (const item of data.top_k) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = item.display_name;
    const pct = document.createElement("span");
    pct.textContent = `${Math.round(item.confidence * 100)}%`;
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(item.confidence * 100, 2)}%`;
    bar.appendChild(fill);
    li.append(name, pct, bar);
    topk.appendChild(li);
  }
  customClass.value = data.display_name;
  confirmStatus.hidden = true;
  confirmStatus.textContent = "";
  setState({ data });
}

async function classify(file) {
  setState({ loading: true });
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/predict", { method: "POST", body: form });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.detail || "Classification failed.");
    }
    renderResult(payload);
  } catch (err) {
    setState({ error: err.message || "Something went wrong." });
  }
}

function showPreview(file) {
  const url = URL.createObjectURL(file);
  preview.src = url;
  previewWrap.hidden = false;
  dropTarget.hidden = true;
}

function resetUpload() {
  fileInput.value = "";
  preview.removeAttribute("src");
  previewWrap.hidden = true;
  dropTarget.hidden = false;
  latestPrediction = null;
  setState({});
}

async function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setState({ error: "Please choose an image file." });
    return;
  }
  showPreview(file);
  await classify(file);
}

function resolveLabel(raw) {
  const text = raw.trim();
  if (!text) return null;

  const byDisplay = knownClasses.find(
    (item) => item.display_name.toLowerCase() === text.toLowerCase()
  );
  if (byDisplay) {
    return {
      confirmed_label: byDisplay.label,
      confirmed_display: byDisplay.display_name,
      is_custom: false,
    };
  }

  const byLabel = knownClasses.find(
    (item) => item.label.toLowerCase() === text.toLowerCase()
  );
  if (byLabel) {
    return {
      confirmed_label: byLabel.label,
      confirmed_display: byLabel.display_name,
      is_custom: false,
    };
  }

  return {
    confirmed_label: text,
    confirmed_display: text,
    is_custom: true,
  };
}

function buildRecipeCard(recipe) {
  const article = document.createElement("article");
  article.className = "recipe-card";

  const title = document.createElement("h3");
  title.textContent = recipe.title || "Untitled recipe";

  const meta = document.createElement("p");
  meta.className = "recipe-meta";
  const bits = [];
  if (recipe.time_minutes) bits.push(`~${recipe.time_minutes} min`);
  if (recipe.servings) bits.push(`${recipe.servings} servings`);
  meta.textContent = bits.join(" · ");

  const used = document.createElement("p");
  used.className = "recipe-used";
  used.textContent = `Uses: ${(recipe.ingredients_used || []).join(", ") || "—"}`;

  const missing = document.createElement("p");
  missing.className = "recipe-missing";
  const missingList = recipe.missing_ingredients || [];
  missing.textContent = missingList.length
    ? `Missing: ${missingList.join(", ")}`
    : "No extra ingredients needed";

  const stepsTitle = document.createElement("p");
  stepsTitle.className = "recipe-steps-title";
  stepsTitle.textContent = "Steps";

  const steps = document.createElement("ol");
  steps.className = "recipe-steps";
  for (const step of recipe.steps || []) {
    const li = document.createElement("li");
    li.textContent = step;
    steps.appendChild(li);
  }

  article.append(title, meta, used, missing, stepsTitle, steps);
  return article;
}

function updateCarousel(offsetPx = 0) {
  const total = recipeQueue.length;
  const hasRecipes = total > 0;
  prevRecipeBtn.disabled = !hasRecipes || recipeIndex <= 0;
  nextRecipeBtn.disabled = !hasRecipes || recipeIndex >= total - 1;
  carouselCount.textContent = hasRecipes ? `${recipeIndex + 1} / ${total}` : "";

  const base = hasRecipes ? -recipeIndex * 100 : 0;
  if (offsetPx) {
    recipesGrid.classList.add("is-dragging");
    recipesGrid.style.transform = `translateX(calc(${base}% + ${offsetPx}px))`;
  } else {
    recipesGrid.classList.remove("is-dragging");
    recipesGrid.style.transform = `translateX(${base}%)`;
  }
}

function goToRecipe(index) {
  if (!recipeQueue.length) return;
  recipeIndex = Math.max(0, Math.min(index, recipeQueue.length - 1));
  updateCarousel();
}

function bindCarouselGestures() {
  if (carouselBound) return;
  carouselBound = true;

  carouselViewport.addEventListener("pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    if (!recipeQueue.length) return;
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      locked: null,
      pointerId: event.pointerId,
    };
    carouselViewport.setPointerCapture(event.pointerId);
    carouselViewport.classList.add("is-dragging");
  });

  carouselViewport.addEventListener("pointermove", (event) => {
    if (!dragState) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (dragState.locked == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      dragState.locked = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }
    if (dragState.locked !== "x") return;
    dragState.dx = dx;
    dragState.dy = dy;
    updateCarousel(dx);
  });

  const endDrag = () => {
    if (!dragState) return;
    const { dx, locked } = dragState;
    dragState = null;
    carouselViewport.classList.remove("is-dragging");
    if (locked === "x") {
      if (dx <= -SWIPE_THRESHOLD) goToRecipe(recipeIndex + 1);
      else if (dx >= SWIPE_THRESHOLD) goToRecipe(recipeIndex - 1);
      else updateCarousel();
    } else {
      updateCarousel();
    }
  };

  carouselViewport.addEventListener("pointerup", endDrag);
  carouselViewport.addEventListener("pointercancel", endDrag);

  // Trackpad / mouse wheel horizontal swipe
  carouselViewport.addEventListener(
    "wheel",
    (event) => {
      if (!recipeQueue.length) return;
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!horizontal || Math.abs(event.deltaX) < 12) return;
      event.preventDefault();
      if (event.deltaX > 0) goToRecipe(recipeIndex + 1);
      else goToRecipe(recipeIndex - 1);
    },
    { passive: false }
  );
}

function renderRecipes(payload) {
  recipesSection.hidden = false;
  recipesLede.textContent = `Based on: ${payload.ingredients.join(", ")}`;
  recipesGrid.innerHTML = "";
  recipeQueue = payload.recipes || [];
  recipeIndex = 0;

  for (const recipe of recipeQueue) {
    recipesGrid.appendChild(buildRecipeCard(recipe));
  }

  bindCarouselGestures();
  updateCarousel();
  recipesSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function suggestRecipes() {
  if (!pantryItems.length) return;
  suggestBtn.disabled = true;
  setPantryStatus("Asking Smart Chef for recipes…");
  try {
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredients: pantryItems.map((item) => item.name),
      }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.detail || "Recipe suggestion failed.");
    }
    setPantryStatus("");
    renderRecipes(payload);
  } catch (err) {
    setPantryStatus(err.message || "Recipe suggestion failed.", true);
  } finally {
    suggestBtn.disabled = pantryItems.length === 0;
  }
}

confirmForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const resolved = resolveLabel(customClass.value);
  if (!resolved) {
    confirmStatus.hidden = false;
    confirmStatus.textContent = "Enter a food name.";
    confirmStatus.classList.add("is-error");
    return;
  }

  const agreedWithModel =
    latestPrediction && resolved.confirmed_label === latestPrediction.prediction;

  const payload = {
    predicted: latestPrediction?.prediction ?? null,
    predicted_display: latestPrediction?.display_name ?? null,
    confidence: latestPrediction?.confidence ?? null,
    confirmed_label: resolved.confirmed_label,
    confirmed_display: resolved.confirmed_display,
    is_custom: resolved.is_custom,
    agreed_with_model: Boolean(agreedWithModel),
    add_to_pantry: true,
  };

  try {
    const res = await fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Could not save confirmation.");
    }
    pantryItems = data.pantry || pantryItems;
    renderPantry();
  } catch (err) {
    confirmStatus.hidden = false;
    confirmStatus.textContent = err.message || "Could not save confirmation.";
    confirmStatus.classList.add("is-error");
    return;
  }

  resultLabel.textContent = resolved.confirmed_display;
  customClass.value = resolved.confirmed_display;
  confirmStatus.hidden = false;
  confirmStatus.classList.remove("is-error");
  confirmStatus.textContent = `Added ${resolved.confirmed_display} to your pantry. Upload another photo or suggest recipes.`;
});

dropTarget.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});
clearBtn.addEventListener("click", resetUpload);
sampleHint.addEventListener("click", () => {
  document.getElementById("classes-section").scrollIntoView({ behavior: "smooth" });
});
suggestBtn.addEventListener("click", suggestRecipes);
clearPantryBtn.addEventListener("click", clearPantry);
prevRecipeBtn.addEventListener("click", () => goToRecipe(recipeIndex - 1));
nextRecipeBtn.addEventListener("click", () => goToRecipe(recipeIndex + 1));

document.addEventListener("keydown", (event) => {
  if (recipesSection.hidden) return;
  if (event.key === "ArrowLeft") goToRecipe(recipeIndex - 1);
  if (event.key === "ArrowRight") goToRecipe(recipeIndex + 1);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});

dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

fetch("/api/classes")
  .then((res) => res.json())
  .then((data) => {
    knownClasses = data.classes || [];
    classGrid.innerHTML = "";
    for (const item of knownClasses) {
      const li = document.createElement("li");
      li.textContent = item.display_name;
      classGrid.appendChild(li);
    }
  })
  .catch(() => {
    classGrid.innerHTML = "<li>Could not load class list.</li>";
  });

refreshPantry().catch(() => {
  setPantryStatus("Could not load pantry.", true);
});
