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

function setState({ loading = false, error = null, data = null } = {}) {
  resultIdle.hidden = loading || Boolean(error) || Boolean(data);
  resultLoading.hidden = !loading;
  resultError.hidden = !error;
  resultBody.hidden = !data;
  if (error) resultError.textContent = error;
}

function renderResult(data) {
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

dropTarget.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});
clearBtn.addEventListener("click", resetUpload);
sampleHint.addEventListener("click", () => {
  document.getElementById("classes-section").scrollIntoView({ behavior: "smooth" });
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
    classGrid.innerHTML = "";
    for (const item of data.classes) {
      const li = document.createElement("li");
      li.textContent = item.display_name;
      classGrid.appendChild(li);
    }
  })
  .catch(() => {
    classGrid.innerHTML = "<li>Could not load class list.</li>";
  });
