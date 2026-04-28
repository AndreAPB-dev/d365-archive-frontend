// app.js (REST listing + REST upload via SAS + selection based actions)

// ---------- 0) Path from URL ----------
const params = new URLSearchParams(window.location.search);
const path = params.get("path");

if (!path) {
  alert("No 'path' parameter in URL");
  throw new Error("Missing path");
}
//Test extra line
//document.getElementById("currentPath").innerText = "Path: " + path;

// ---------- Global state ----------
let selectedFile = null; // { name, blobPath }
let lastCtx = null;

// ---------- 1) Get SAS context ----------
/*async function getSasContext() {
  const response = await fetch("http://localhost:7153/api/GetArchiveSas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path })
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error("Failed to retrieve SAS: " + txt);
  }

  return response.json();
}*/

// ---------- 1) Get SAS context ----------
async function getSasContext() {
  const response = await fetch("https://fa-d365-archive-dta.azurewebsites.net/api/getarchivesas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-functions-key": "yHQRAG6vjWU8lev5wqTGmFN8eRs0XF-2fh7S9zjR1Yj7AzFu66kYBA=="
    },
    body: JSON.stringify({ path })
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error("Failed to retrieve SAS: " + txt);
  }

  return response.json();
}


// ---------- 2) SAS unescape ----------
function unescapeSas(s) {
  return (s || "")
    .replaceAll("&amp;amp;amp;", "&amp;amp;")
    .replaceAll("&amp;amp;", "&amp;");
}

// ---------- 3) Helper: encode blobname, keeps slashes ----------
function encodeBlobName(blobName) {
  return blobName
    .split("/")
    .map(seg => encodeURIComponent(seg))
    .join("/");
}

// ---------- 3A) Check New folder name ----------
function sanitizeFolderName(name) {
  const n = (name || "").trim();
  if (!n || n === "." || n === "..") return null;
  if (/[\/\\]/.test(n)) return null;
  return n;
}

//BreadCrumb path
function renderBreadcrumb(path) {
  const nav = document.getElementById("breadcrumb");
  if (!nav) return;

  nav.innerHTML = "";

  const parts = path.split("/").filter(Boolean);
  let runningPath = "";

  parts.forEach((part, idx) => {
    runningPath = runningPath ? `${runningPath}/${part}` : part;

    if (idx < parts.length - 1) {
      // clickable breadcrumb item
      const a = document.createElement("a");
      a.href = `?path=${encodeURIComponent(runningPath)}`;
      a.textContent = part;
      a.style.marginRight = "4px";

      nav.appendChild(a);
      nav.appendChild(document.createTextNode(" / "));
    } else {
      // current folder (not clickable)
      const span = document.createElement("span");
      span.textContent = part;
      span.style.fontWeight = "600";
      nav.appendChild(span);
    }
  });
}


// ---------- 4) LIST blobs (folders + files) ----------
async function listBlobs(ctx) {
  lastCtx = ctx;
  selectedFile = null;
  updateActionButtons();

  const ul = document.getElementById("fileList");

  ul.innerHTML = "<li>Loading…</li>";
  await new Promise(requestAnimationFrame);
  
  //await new Promise(r => setTimeout(r, 1000));  //Test only

  const sasToken = unescapeSas(ctx.sasToken);
  const prefix = (path.endsWith("/") ? path : path + "/");

  const url =
    `${ctx.containerUrl}${sasToken}` +
    `&restype=container&comp=list` +
    `&prefix=${encodeURIComponent(prefix)}` +
    `&delimiter=/`;

  ctx.getUploadBlobSasUrl = "https://fa-d365-archive-dta.azurewebsites.net/api/GetUploadBlobSas";
  ctx.functionKey = ""; // laat leeg "" als je straks Anonymous gaat

  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("Blob list failed: " + res.status + " " + txt);
  }

  const xmlText = await res.text();
  ul.innerHTML = "";
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");

  const prefixes = Array.from(doc.getElementsByTagName("BlobPrefix"))
    .map(x => x.getElementsByTagName("Name")[0]?.textContent)
    .filter(Boolean);

  const blobs = Array.from(doc.getElementsByTagName("Blob"))
    .map(x => x.getElementsByTagName("Name")[0]?.textContent)
    .filter(Boolean);

  let found = false;

  // ---------- folders ----------
  for (const p of prefixes) {
    found = true;
    const folderName = p.substring(prefix.length).replace(/\/$/, "");
    const li = document.createElement("li");
    const a = document.createElement("a");

    a.href = `?path=${encodeURIComponent(prefix + folderName)}`;
    a.textContent = "📁 " + folderName;

    li.appendChild(a);
    ul.appendChild(li);
  }

  // ---------- files (selection only) ----------
  for (const b of blobs) {
    found = true;
    const fileName = b.substring(prefix.length);

    const li = document.createElement("li");
    li.textContent = "📄 " + fileName;
    li.style.cursor = "pointer";

    li.addEventListener("click", () => {
      document.querySelectorAll("li.selected").forEach(x =>
        x.classList.remove("selected")
      );
      li.classList.add("selected");

      selectedFile = {
        name: fileName,
        blobPath: b
      };

      updateActionButtons();
    });

    ul.appendChild(li);
  }

  if (!found) {
    const li = document.createElement("li");
    li.textContent = "(Empty — no files in this folder yet)";
    ul.appendChild(li);
  }
}

// ---------- Action buttons ----------
const btnPreview = document.getElementById("btnPreview");
const btnDownload = document.getElementById("btnDownload");

function updateActionButtons() {
  const enabled = !!selectedFile;
  btnPreview.disabled = !enabled;
  btnDownload.disabled = !enabled;
}

// Preview (browser, new tab)
btnPreview?.addEventListener("click", () => {
  if (!selectedFile || !lastCtx) return;

  const sasToken = unescapeSas(lastCtx.sasToken);
  const encoded = encodeBlobName(selectedFile.blobPath);
  const url = `${lastCtx.containerUrl}/${encoded}${sasToken}`;

  window.open(url, "_blank", "noopener");
});

// Download (always real download → OS tool)
btnDownload?.addEventListener("click", async () => {
  if (!selectedFile || !lastCtx) return;

  const sasToken = unescapeSas(lastCtx.sasToken);
  const encoded = encodeBlobName(selectedFile.blobPath);

  const url =
    `${lastCtx.containerUrl}/${encoded}${sasToken}` +
    `&response-content-disposition=${encodeURIComponent(
      `attachment; filename="${selectedFile.name}"`
    )}`;

  const response = await fetch(url);
  if (!response.ok) {
    alert("Download failed");
    return;
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = selectedFile.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(blobUrl);
});
/*
// ---------- 5) UPLOAD (drag & drop) ----------
async function uploadFileToBlob(ctx, file) {
  const sasToken = unescapeSas(ctx.sasToken);
  const prefix = (path.endsWith("/") ? path : path + "/");
  const blobName = prefix + file.name;

  const uploadUrl =
    `${ctx.containerUrl}/${encodeBlobName(blobName)}${sasToken}`;

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": file.type || "application/octet-stream"
    },
    body: file
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upload failed (${file.name}): ${txt}`);
  }
}
*/
// ---------- 5) UPLOAD (drag & drop) ----------
async function uploadFileToBlob(ctx, file) {
  // folderPath = current path without leading/trailing slashes
  const folderPath = (path || "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  // 1) Per file ask for a blob-level uploadUrl
  const reqBody = {
    folderPath: folderPath,
    fileName: file.name
  };

  const sasResp = await fetch(ctx.getUploadBlobSasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ctx.functionKey ? { "x-functions-key": ctx.functionKey } : {})
    },
    body: JSON.stringify(reqBody)
  });

  if (!sasResp.ok) {
    const txt = await sasResp.text();
    throw new Error(`GetUploadBlobSas failed (${file.name}): ${sasResp.status} ${txt}`);
  }

  const sasJson = await sasResp.json();
  const uploadUrl = sasJson.uploadUrl;

  if (!uploadUrl) {
    throw new Error(`GetUploadBlobSas response missing uploadUrl (${file.name})`);
  }

  // 2) Upload directly to Blob with PUT on uploadUrl
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": file.type || "application/octet-stream"
    },
    body: file
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upload failed (${file.name}): ${res.status} ${txt}`);
  }
}

// ---------- 6) Wire up Dropzone ----------
function enableDragDrop(ctx) {
  const dropzone = document.getElementById("dropzone");

  dropzone.addEventListener("dragover", e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", async e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;

    for (const file of files) {
      await uploadFileToBlob(ctx, file);
    }

    await listBlobs(ctx);
  });
}

// ---------- 7) Start ----------
(async () => {
  renderBreadcrumb(path);
  
  const ul = document.getElementById("fileList");
  ul.innerHTML = "<li>Initializing…</li>";
  await new Promise(requestAnimationFrame);
    
  const ctx = await getSasContext();
  await listBlobs(ctx);
  enableDragDrop(ctx);

  // Up one level
  const btnUp = document.getElementById("btnUp");
  if (btnUp) {
    btnUp.addEventListener("click", () => {
      const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
      const idx = trimmed.lastIndexOf("/");

      if (idx === -1) {
        // Already at top level, do nothing
        return;
      }

      const parentPath = trimmed.substring(0, idx);
      window.location.href = `?path=${encodeURIComponent(parentPath)}`;
    });
  }

  // New folder
  const btnNewFolder = document.getElementById("btnNewFolder");
  if (btnNewFolder) {
    btnNewFolder.addEventListener("click", () => {
      const input = prompt("Folder name:");
      const folderName = sanitizeFolderName(input);
      if (!folderName) return alert("Invalid folder name.");

      const basePath = path.endsWith("/") ? path.slice(0, -1) : path;
      window.location.href =
        `?path=${encodeURIComponent(`${basePath}/${folderName}`)}`;
    });
  }
})();