const API_BASE = "/api";
//آپلود عکس
const CLOUDINARY_CLOUD_NAME = "dzhdqfaye";
const CLOUDINARY_UPLOAD_PRESET = "birthday_gifts"; 

const TOKEN_STORAGE_KEY = "gift-admin-token";

const tokenInput = document.getElementById("admin-token");
const saveTokenBtn = document.getElementById("save-token-btn");
const logoutBtn = document.getElementById("logout-btn");
const itemForm = document.getElementById("item-form");
const itemIdInput = document.getElementById("item-id");
// ==================== Selectors ====================
let titleInput, slugInput, descriptionInput, imagesInput;

function initSelectors() {
    titleInput = document.getElementById("item-title");
    slugInput = document.getElementById("item-slug");
    descriptionInput = document.getElementById("item-description");
    imagesInput = document.getElementById("item-images");
}

const cancelEditBtn = document.getElementById("cancel-edit-btn");
const submitBtn = document.getElementById("submit-btn");
const adminItems = document.getElementById("admin-items");
const adminStatus = document.getElementById("admin-status");
const formPanel = document.getElementById("admin-form-panel");
const toast = document.getElementById("admin-toast");
const toastContent = document.getElementById("admin-toast-content");

let items = [];
let reservationsMap = {};
let toastTimer = null;

function getToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function setToken(token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearToken() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function getAuthHeaders(includeJson = false) {
    const token = getToken();
    const headers = {};

    if (includeJson) {
        headers["Content-Type"] = "application/json";
    }

    if (token) {
        headers["x-admin-token"] = token;
    }

    return headers;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
//تابع آپلود عکس
async function uploadToCloudinary(file) {
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(url, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        throw new Error("خطا در آپلود عکس به Cloudinary");
    }

    const data = await response.json();
    return data.secure_url;
}


function setStatus(message) {
    adminStatus.textContent = message;
}

function showToast(message, type = "info") {
    if (toastTimer) {
        window.clearTimeout(toastTimer);
    }

    toastContent.textContent = message;
    toast.className = `admin-toast show ${type}`;

    toast.hidden = false;

    toastTimer = window.setTimeout(() => {
        toast.className = "admin-toast";
        toast.hidden = true;
    }, 3200);
}

function showSuccess(message) {
    setStatus(message);
    showToast(message, "success");
}

function showError(message) {
    setStatus(message);
    showToast(message, "error");
}

function lockAdminUi(message = "برای مشاهده و مدیریت، توکن ادمین را وارد کن.") {
    formPanel.hidden = true;
    formPanel.classList.add("is-locked");

    adminItems.innerHTML = `
        <div class="empty-state empty-state-locked">
            <div class="empty-state-icon">🔒</div>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

function unlockAdminUi() {
    formPanel.hidden = false;
    formPanel.classList.remove("is-locked");
}

async function verifyToken() {
    const token = getToken();

    if (!token) {
        throw new Error("ابتدا توکن ادمین را وارد کن.");
    }

    const response = await fetch(`${API_BASE}/items?verify=1`, {
        method: "GET",
        headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "توکن ادمین معتبر نیست.");
    }

    return data;
}

async function fetchItems() {
    const response = await fetch(`${API_BASE}/items`, {
        method: "GET",
        headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "خطا در دریافت هدیه‌ها");
    }

    return data;
}

async function fetchReservations() {
    const response = await fetch(`${API_BASE}/reservations`, {
        method: "GET",
        headers: getAuthHeaders(),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        return {};
    }

    return data;
}

async function sendItemRequest(method, body) {
    const token = getToken();

    if (!token) {
        throw new Error("ابتدا توکن ادمین را وارد کن.");
    }

    const response = await fetch(`${API_BASE}/items`, {
        method,
        headers: getAuthHeaders(true),
        body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "خطا در ذخیره اطلاعات");
    }

    return data;
}

function resetForm() {
    itemForm.reset();
    itemIdInput.value = "";
    submitBtn.textContent = "ذخیره هدیه";
}

function fillForm(item) {
    itemIdInput.value = item.id;
    titleInput.value = item.title || "";
    slugInput.value = item.slug || "";
    descriptionInput.value = item.description || "";
    imagesInput.value = Array.isArray(item.images) ? item.images.join("\n") : "";
    submitBtn.textContent = "ثبت ویرایش";
    window.scrollTo({ top: 0, behavior: "smooth" });
    formPanel.classList.add("panel-pulse");

    window.setTimeout(() => {
        formPanel.classList.remove("panel-pulse");
    }, 900);
}

function createAdminItemCard(item) {
    const reservation = reservationsMap[String(item.id)];
    const isReserved = Boolean(reservation && reservation.reserved);

    return `
        <article class="admin-item-card ${isReserved ? "is-reserved" : "is-available"}">
            <div class="admin-item-head">
                <div class="admin-item-heading">
                    <h3 class="admin-item-title">${escapeHtml(item.title)}</h3>
                    <p class="admin-item-meta">ID: ${item.id} | slug: ${escapeHtml(item.slug || "")}</p>
                </div>

                <span class="status-badge ${isReserved ? "reserved" : "available"}">
                    ${isReserved ? "رزرو شده" : "آزاد"}
                </span>
            </div>

            <p class="admin-item-description">${escapeHtml(item.description || "")}</p>

            <div class="admin-item-footer">
                <p class="admin-item-meta">
                    تعداد عکس‌ها: ${Array.isArray(item.images) ? item.images.length : 0}
                </p>

                <div class="admin-item-actions">
                    <button class="icon-btn icon-btn-edit edit-item-btn" type="button" data-id="${item.id}" aria-label="ویرایش">
                        <span aria-hidden="true">✏️</span>
                    </button>
                    <button class="icon-btn icon-btn-delete delete-item-btn" type="button" data-id="${item.id}" aria-label="حذف">
                        <span aria-hidden="true">🗑️</span>
                    </button>
                </div>
            </div>
        </article>
    `;
}

function renderItems() {
    if (!items.length) {
        adminItems.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎁</div>
                <p>هنوز هدیه‌ای ثبت نشده است.</p>
            </div>
        `;
        return;
    }

    adminItems.innerHTML = items.map(createAdminItemCard).join("");

    document.querySelectorAll(".edit-item-btn").forEach((button) => {
        button.addEventListener("click", () => {
            const item = items.find((entry) => Number(entry.id) === Number(button.dataset.id));
            if (item) {
                fillForm(item);
                showToast("اطلاعات هدیه برای ویرایش بارگذاری شد.", "info");
            }
        });
    });

    document.querySelectorAll(".delete-item-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const itemId = Number(button.dataset.id);
            const confirmed = window.confirm("آیا از حذف این هدیه مطمئن هستی؟");

            if (!confirmed) {
                return;
            }

            try {
                await sendItemRequest("DELETE", { id: itemId });
                showSuccess("هدیه با موفقیت حذف شد.");
                await refreshAdminData();
                resetForm();
            } catch (error) {
                showError(error.message || "خطا در حذف هدیه.");
            }
        });
    });
}

async function refreshAdminData() {
    setStatus("در حال بارگذاری اطلاعات ادمین...");
    [items, reservationsMap] = await Promise.all([fetchItems(), fetchReservations()]);
    renderItems();
    unlockAdminUi();
    setStatus(`${items.length} هدیه موجود است.`);
}

saveTokenBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();

    if (!token) {
        showError("توکن ادمین را وارد کن.");
        return;
    }

    try {
        setToken(token);
        await verifyToken();
        showSuccess("توکن با موفقیت تأیید شد.");
        await refreshAdminData();
    } catch (error) {
        clearToken();
        lockAdminUi("توکن نامعتبر است. دوباره تلاش کن.");
        showError(error.message || "توکن ادمین معتبر نیست.");
    }
});

logoutBtn.addEventListener("click", () => {
    clearToken();
    tokenInput.value = "";
    resetForm();
    items = [];
    reservationsMap = {};
    lockAdminUi();
    showSuccess("توکن پاک شد.");
});

cancelEditBtn.addEventListener("click", () => {
    resetForm();
    showToast("فرم به حالت اولیه برگشت.", "info");
});

itemForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const body = {
        title: titleInput.value.trim(),
        slug: slugInput.value.trim(),
        description: descriptionInput.value.trim(),
        images: imagesInput.value,
    };

    const itemId = Number(itemIdInput.value || 0);

    try {
        if (itemId) {
            await sendItemRequest("PUT", { ...body, id: itemId });
            showSuccess("هدیه با موفقیت ویرایش شد.");
        } else {
            await sendItemRequest("POST", body);
            showSuccess("هدیه جدید با موفقیت اضافه شد.");
        }

        resetForm();
        await refreshAdminData();
    } catch (error) {
        showError(error.message || "خطا در ذخیره هدیه.");
    }
});

async function init() {
    initSelectors(); // ← اضافه شد

    const savedToken = getToken();

    if (!savedToken) {
        lockAdminUi();
        setStatus("توکن ادمین وارد نشده است.");
        return;
    }

    tokenInput.value = savedToken;

    try {
        await verifyToken();
        await refreshAdminData();
        showToast("ورود قبلی بازیابی شد.", "info");
    } catch (error) {
        clearToken();
        tokenInput.value = "";
        lockAdminUi("توکن ذخیره‌شده معتبر نیست. دوباره وارد کن.");
        showError(error.message || "توکن معتبر نیست.");
    }
}


init();
// ==================== Cloudinary Image Upload ====================
const uploadInput = document.getElementById("image-upload-input");
const uploadBtn = document.getElementById("upload-image-btn");
const uploadStatus = document.getElementById("upload-status");
const imagePreview = document.getElementById("image-preview");

if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener("click", async () => {
        const file = uploadInput.files[0];
        if (!file) {
            showError("لطفاً یک عکس انتخاب کنید.");
            return;
        }

        uploadBtn.disabled = true;
        uploadStatus.textContent = "در حال آپلود...";
        uploadStatus.style.color = "#666";

        try {
            const imageUrl = await uploadToCloudinary(file);

            // اضافه کردن لینک به textarea
            // اضافه کردن لینک به textarea
            let currentValue = imagesInput.value.trim();
            if (currentValue) {
                // اگر قبلاً JSON بود، parse کن، اگه نبود، از split استفاده کن
                let existingImages = [];
                try {
                    existingImages = JSON.parse(currentValue);
                    if (!Array.isArray(existingImages)) existingImages = [];
                } catch (e) {
                    existingImages = currentValue.split('\n').filter(Boolean);
                }
                existingImages.push(imageUrl);
                imagesInput.value = JSON.stringify(existingImages);
            } else {
                imagesInput.value = JSON.stringify([imageUrl]);
            }

            // نمایش پیش‌نمایش
            imagePreview.innerHTML = `
                <img src="${imageUrl}" style="max-width: 120px; border-radius: 6px; border: 1px solid #ddd;" />
            `;

            uploadStatus.textContent = "آپلود موفق بود ✓";
            uploadStatus.style.color = "green";
            showSuccess("عکس با موفقیت آپلود شد.");

        } catch (error) {
            uploadStatus.textContent = "خطا در آپلود";
            uploadStatus.style.color = "red";
            showError(error.message);
        } finally {
            uploadBtn.disabled = false;
            uploadInput.value = "";
        }
    });
}

