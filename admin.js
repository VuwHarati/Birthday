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
let titleInput, slugInput, descriptionInput, priceMinInput, priceMaxInput, legacyPriceInput, categoryInput;

function initSelectors() {
    titleInput = document.getElementById("item-title");
    slugInput = document.getElementById("item-slug");
    descriptionInput = document.getElementById("item-description");
    priceMinInput = document.getElementById("item-price-min");
    priceMaxInput = document.getElementById("item-price-max");
    legacyPriceInput = document.getElementById("item-legacy-price");
    categoryInput = document.getElementById("item-category");
}

const cancelEditBtn = document.getElementById("cancel-edit-btn");
const submitBtn = document.getElementById("submit-btn");
const adminItems = document.getElementById("admin-items");
const adminStatus = document.getElementById("admin-status");
const formPanel = document.getElementById("admin-form-panel");
const toast = document.getElementById("admin-toast");
const toastContent = document.getElementById("admin-toast-content");
const reservationCount = document.getElementById("reservation-count");
const reservationFilter = document.getElementById("reservation-filter");

let items = [];
let reservationsMap = {};
let categories = [];
let toastTimer = null;
const imageLinksList = document.getElementById("image-links-list");
const storeLinksList = document.getElementById("store-links-list");
const categoriesDialog = document.getElementById("categories-dialog");
const categoriesList = document.getElementById("categories-list");

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

function asciiDigits(value) {
    return String(value).replace(/[۰-۹٠-٩]/g, (digit) => {
        const code = digit.charCodeAt(0);
        return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    });
}

function parseTomanAmount(value) {
    const normalized = asciiDigits(value).replace(/[\s,٬،]/g, "");
    if (!normalized) return null;
    if (!/^\d+$/.test(normalized)) return Number.NaN;
    return Number(normalized);
}

function formatTomanAmount(value) {
    return new Intl.NumberFormat("fa-IR").format(value);
}

function formatGroupedAmountInput(input) {
    const value = input.value;
    const caret = input.selectionStart ?? value.length;
    const digitsBefore = (value.slice(0, caret).match(/[۰-۹٠-٩0-9]/g) || []).length;
    const digits = asciiDigits(value).replace(/[\s,٬،]/g, "");
    if (!digits || !/^\d+$/.test(digits)) return;
    const formatted = formatTomanAmount(Number(digits));
    input.value = formatted;
    let position = 0;
    let digitCount = 0;
    if (digitsBefore > 0) {
        for (const char of formatted) {
            position += char.length;
            if (/[۰-۹٠-٩0-9]/.test(char)) digitCount += 1;
            if (digitCount >= digitsBefore) break;
        }
    }
    input.setSelectionRange(position, position);
}

function getPriceValues() {
    const min = parseTomanAmount(priceMinInput.value);
    const max = parseTomanAmount(priceMaxInput.value);
    if (Number.isNaN(min) || Number.isNaN(max)) throw new Error("قیمت را فقط با عدد وارد کن.");
    if ((min === null) !== (max === null)) throw new Error("برای بازه قیمت، حداقل و حداکثر را هر دو وارد کن.");
    if (min !== null && (min < 1000 || min > 1000000000 || max < 1000 || max > 1000000000)) {
        throw new Error("قیمت باید بین ۱٬۰۰۰ تا ۱٬۰۰۰٬۰۰۰٬۰۰۰ تومان باشد.");
    }
    if (min !== null && min > max) throw new Error("حداقل قیمت نمی‌تواند از حداکثر قیمت بیشتر باشد.");
    return { priceMin: min, priceMax: max };
}

function makeImageLinkRow(value = "") {
    const row = document.createElement("div");
    row.className = "image-link-row";
    const preview = document.createElement("img");
    preview.className = "image-link-preview";
    preview.alt = "پیش‌نمایش عکس هدیه";
    preview.hidden = true;
    const input = document.createElement("input");
    input.className = "admin-input image-link-input";
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = "نشانی عکس یا مسیر محلی";
    input.value = value;
    const remove = document.createElement("button");
    remove.className = "remove-entry-btn";
    remove.type = "button";
    remove.textContent = "حذف";
    const updatePreview = () => {
        const url = input.value.trim();
        preview.hidden = !url;
        preview.src = url.startsWith("Images/") ? `/${url}` : url;
    };
    input.addEventListener("input", updatePreview);
    remove.addEventListener("click", () => row.remove());
    row.append(preview, input, remove);
    if (value) updatePreview();
    return row;
}

function addImageLink(value = "") {
    if (value) {
        const emptyInput = [...imageLinksList.querySelectorAll(".image-link-input")].find((input) => !input.value.trim());
        if (emptyInput) {
            emptyInput.value = value;
            emptyInput.dispatchEvent(new Event("input", { bubbles: true }));
            return;
        }
    }
    if (imageLinksList.querySelectorAll(".image-link-input").length >= 8) {
        showError("حداکثر ۸ تصویر برای هر هدیه مجاز است.");
        return;
    }
    imageLinksList.append(makeImageLinkRow(value));
}

function readImageLinks() {
    return [...imageLinksList.querySelectorAll(".image-link-input")]
        .map((input) => input.value.trim()).filter(Boolean);
}

function makeStoreLinkRow(link = {}) {
    const row = document.createElement("div");
    row.className = "store-link-row";
    const title = document.createElement("input");
    title.className = "admin-input store-link-title";
    title.type = "text";
    title.maxLength = 80;
    title.placeholder = "عنوان نمایشی، مثلاً خرید آنلاین از دیجی‌کالا";
    title.value = link.title || "";
    const url = document.createElement("input");
    url.className = "admin-input store-link-url";
    url.type = "url";
    url.inputMode = "url";
    url.maxLength = 2048;
    url.placeholder = "https://...";
    url.value = link.url || "";
    const remove = document.createElement("button");
    remove.className = "remove-entry-btn";
    remove.type = "button";
    remove.textContent = "حذف";
    remove.addEventListener("click", () => row.remove());
    row.append(title, url, remove);
    return row;
}

function addStoreLink(link = {}) {
    if (storeLinksList.querySelectorAll(".store-link-row").length >= 5) {
        showError("حداکثر ۵ لینک فروشگاه برای هر هدیه مجاز است.");
        return;
    }
    storeLinksList.append(makeStoreLinkRow(link));
}

function readStoreLinks() {
    return [...storeLinksList.querySelectorAll(".store-link-row")].map((row) => ({
        title: row.querySelector(".store-link-title").value.trim(),
        url: row.querySelector(".store-link-url").value.trim(),
    })).filter((link) => link.title || link.url);
}

function renderCategoryOptions(selected = "") {
    categoryInput.replaceChildren(new Option("بدون دسته‌بندی", ""));
    categories.forEach((name) => categoryInput.add(new Option(name, name)));
    if (selected && !categories.includes(selected)) categoryInput.add(new Option(`${selected} (قدیمی)`, selected));
    categoryInput.value = selected;
}

async function fetchCategories() {
    const response = await fetch(`${API_BASE}/categories`, { headers: getAuthHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "خطا در دریافت دسته‌بندی‌ها");
    return Array.isArray(data.categories) ? data.categories : [];
}

function renderCategoriesDialog() {
    categoriesList.replaceChildren();
    if (!categories.length) {
        categoriesList.innerHTML = '<p class="field-hint">هنوز دسته‌بندی‌ای ثبت نشده است.</p>';
        return;
    }
    categories.forEach((name) => {
        const row = document.createElement("div");
        row.className = "category-row";
        const label = document.createElement("span");
        label.textContent = name;
        const remove = document.createElement("button");
        remove.className = "remove-entry-btn";
        remove.type = "button";
        remove.textContent = "حذف";
        remove.addEventListener("click", async () => {
            try {
                const response = await fetch(`${API_BASE}/categories`, {
                    method: "DELETE",
                    headers: getAuthHeaders(true),
                    body: JSON.stringify({ name }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || "حذف دسته‌بندی انجام نشد.");
                const selectedCategory = categoryInput.value === name ? "" : categoryInput.value;
                categories = data.categories || [];
                renderCategoriesDialog();
                renderCategoryOptions(selectedCategory);
                showSuccess("دسته‌بندی حذف شد.");
            } catch (error) {
                showError(error.message || "حذف دسته‌بندی انجام نشد.");
            }
        });
        row.append(label, remove);
        categoriesList.append(row);
    });
}
//تابع آپلود عکس
async function uploadToCloudinary(file) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) throw new Error("فرمت مجاز تصویر: JPG، PNG، WebP یا GIF.");
    if (file.size > 5 * 1024 * 1024) throw new Error("حداکثر حجم هر تصویر ۵ مگابایت است.");
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);
    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            body: formData,
            signal: controller.signal,
        });
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("اتصال به Cloudinary بیش از ۳۰ ثانیه طول کشید. اتصال اینترنت و دسترسی به Cloudinary را بررسی کن.");
        }
        throw new Error("ارتباط با Cloudinary برقرار نشد. اتصال اینترنت، دسترسی شبکه و تنظیمات CORS را بررسی کن.");
    } finally {
        window.clearTimeout(timeoutId);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.secure_url) throw new Error(data.error?.message || "آپلود تصویر انجام نشد؛ تنظیمات Cloudinary را بررسی کنید.");
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

    if (!response.ok) throw new Error(data.error || "خطا در دریافت رزروها");

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
    priceMinInput.value = "";
    priceMaxInput.value = "";
    legacyPriceInput.value = "";
    document.getElementById("legacy-price-note").hidden = true;
    categoryInput.value = "";
    imageLinksList.replaceChildren();
    storeLinksList.replaceChildren();
}

function fillForm(item) {
    itemIdInput.value = item.id;
    titleInput.value = item.title || "";
    slugInput.value = item.slug || "";
    descriptionInput.value = item.description || "";
    imageLinksList.replaceChildren();
    (Array.isArray(item.images) ? item.images : []).forEach(addImageLink);
    priceMinInput.value = Number.isSafeInteger(item.priceMin) ? formatTomanAmount(item.priceMin) : "";
    priceMaxInput.value = Number.isSafeInteger(item.priceMax) ? formatTomanAmount(item.priceMax) : "";
    legacyPriceInput.value = item.priceRange || "";
    const legacyPriceNote = document.getElementById("legacy-price-note");
    legacyPriceNote.textContent = item.priceRange ? `قیمت متنی قبلی «${item.priceRange}» حفظ می‌شود تا بازه عددی جدید وارد کنی.` : "";
    legacyPriceNote.hidden = !item.priceRange;
    renderCategoryOptions(item.category || "");
    storeLinksList.replaceChildren();
    (Array.isArray(item.storeLinks) ? item.storeLinks : []).forEach((link, index) => {
        addStoreLink(typeof link === "string" ? { title: `خرید از فروشگاه ${index + 1}`, url: link } : link);
    });
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
    const reservedAt = reservation?.reservedAt ? new Date(reservation.reservedAt).toLocaleString("fa-IR") : "ثبت نشده";
    const storeLinks = Array.isArray(item.storeLinks) ? item.storeLinks.map((link, index) => (
        typeof link === "string" ? { title: `خرید از فروشگاه ${index + 1}`, url: link } : link
    )).filter((link) => {
        try { return new URL(link.url).protocol === "https:"; } catch { return false; }
    }) : [];
    const priceText = Number.isSafeInteger(item.priceMin) && Number.isSafeInteger(item.priceMax)
        ? `${formatTomanAmount(item.priceMin)} تا ${formatTomanAmount(item.priceMax)} تومان`
        : item.priceRange || "";

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

            <div class="admin-item-extra">
                ${priceText ? `<p><strong>بازه قیمت:</strong> ${escapeHtml(priceText)}</p>` : ""}
                ${item.category ? `<p><strong>دسته‌بندی/اولویت:</strong> ${escapeHtml(item.category)}</p>` : ""}
                ${storeLinks.map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a>`).join(" ")}
            </div>

            ${isReserved ? `
                <div class="reservation-details">
                    <strong>اطلاعات رزرو</strong>
                    <p>نام: ${escapeHtml(reservation.name || "ثبت نشده (رزرو قدیمی)")}</p>
                    <p>توضیحات: ${escapeHtml(reservation.note || "—")}</p>
                    <p>تاریخ: ${escapeHtml(reservedAt)}</p>
                    <button class="admin-btn admin-btn-muted release-reservation-btn" type="button" data-id="${item.id}">آزادسازی رزرو</button>
                </div>
            ` : ""}

            <div class="admin-item-footer">
                <p class="admin-item-meta">
                    تعداد عکس‌ها: ${Array.isArray(item.images) ? item.images.length : 0}
                </p>

                <div class="admin-item-actions">
                    <button class="icon-btn icon-btn-edit edit-item-btn" type="button" data-id="${item.id}" aria-label="ویرایش">
                        <span aria-hidden="true">✏️</span>
                    </button>
                    <button class="icon-btn icon-btn-delete delete-item-btn" type="button" data-id="${item.id}" aria-label="حذف" ${isReserved ? "disabled title=\"ابتدا رزرو را آزاد کنید\"" : ""}>
                        <span aria-hidden="true">🗑️</span>
                    </button>
                </div>
            </div>
        </article>
    `;
}

function renderItems() {
    const filter = reservationFilter?.value || "all";
    const filteredItems = items.filter((item) => {
        const isReserved = Boolean(reservationsMap[String(item.id)]?.reserved);
        return filter === "all" || (filter === "reserved" && isReserved) || (filter === "available" && !isReserved);
    });
    if (!filteredItems.length) {
        adminItems.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎁</div>
                <p>${items.length ? "هدیه‌ای در این فیلتر پیدا نشد." : "هنوز هدیه‌ای ثبت نشده است."}</p>
            </div>
        `;
        return;
    }

    adminItems.innerHTML = filteredItems.map(createAdminItemCard).join("");

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

    document.querySelectorAll(".release-reservation-btn").forEach((button) => {
        button.addEventListener("click", async () => {
            const itemId = Number(button.dataset.id);
            if (!window.confirm("رزرو این هدیه آزاد شود؟")) return;
            button.disabled = true;
            try {
                const response = await fetch(`${API_BASE}/reservations`, {
                    method: "DELETE",
                    headers: getAuthHeaders(true),
                    body: JSON.stringify({ itemId }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || "لغو رزرو انجام نشد.");
                showSuccess("رزرو آزاد شد.");
                await refreshAdminData();
            } catch (error) {
                button.disabled = false;
                showError(error.message || "لغو رزرو انجام نشد.");
            }
        });
    });
}

async function refreshAdminData() {
    setStatus("در حال بارگذاری اطلاعات ادمین...");
    [items, reservationsMap, categories] = await Promise.all([fetchItems(), fetchReservations(), fetchCategories()]);
    renderCategoryOptions(categoryInput.value);
    const totalReservations = items.filter((item) => reservationsMap[String(item.id)]?.reserved).length;
    reservationCount.textContent = new Intl.NumberFormat("fa-IR").format(totalReservations);
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
    const itemId = Number(itemIdInput.value || 0);

    try {
        const body = {
            title: titleInput.value.trim(),
            slug: slugInput.value.trim(),
            description: descriptionInput.value.trim(),
            images: readImageLinks(),
            ...getPriceValues(),
            priceRange: legacyPriceInput.value,
            category: categoryInput.value.trim(),
            storeLinks: readStoreLinks(),
        };
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
    reservationFilter.addEventListener("change", renderItems);

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
document.getElementById("add-image-link-btn").addEventListener("click", () => addImageLink());
document.getElementById("add-store-link-btn").addEventListener("click", () => addStoreLink());
document.getElementById("manage-categories-btn").addEventListener("click", () => {
    renderCategoriesDialog();
    categoriesDialog.showModal();
});
document.getElementById("close-categories-btn").addEventListener("click", () => categoriesDialog.close());
document.getElementById("new-category-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("new-category-name");
    const name = input.value.trim();
    try {
        const response = await fetch(`${API_BASE}/categories`, {
            method: "POST",
            headers: getAuthHeaders(true),
            body: JSON.stringify({ name }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "ثبت دسته‌بندی انجام نشد.");
        categories = data.categories || [];
        renderCategoriesDialog();
        renderCategoryOptions(name);
        input.value = "";
        showSuccess("دسته‌بندی اضافه شد.");
    } catch (error) {
        showError(error.message || "ثبت دسته‌بندی انجام نشد.");
    }
});

for (const input of [document.getElementById("item-price-min"), document.getElementById("item-price-max")]) {
    input.addEventListener("focus", () => {
        const value = parseTomanAmount(input.value);
        if (Number.isSafeInteger(value)) input.value = String(value);
    });
    input.addEventListener("blur", () => {
        const value = parseTomanAmount(input.value);
        if (Number.isSafeInteger(value)) input.value = formatTomanAmount(value);
    });
    input.addEventListener("input", () => {
        formatGroupedAmountInput(input);
        legacyPriceInput.value = "";
        document.getElementById("legacy-price-note").hidden = true;
    });
}

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

        if (readImageLinks().length >= 8) {
            showError("حداکثر ۸ تصویر برای هر هدیه مجاز است.");
            return;
        }

        uploadBtn.disabled = true;
        uploadStatus.textContent = "در حال آپلود...";
        uploadStatus.style.color = "#666";

        try {
            const imageUrl = await uploadToCloudinary(file);

            addImageLink(imageUrl);
            imagePreview.replaceChildren();
            const uploadedPreview = document.createElement("img");
            uploadedPreview.src = imageUrl;
            uploadedPreview.alt = "پیش‌نمایش عکس آپلودشده";
            uploadedPreview.className = "uploaded-image-preview";
            imagePreview.append(uploadedPreview);

            uploadStatus.textContent = "آپلود موفق بود ✓";
            uploadStatus.style.color = "green";
            uploadInput.value = "";
            showSuccess("عکس با موفقیت آپلود شد.");

        } catch (error) {
            uploadStatus.textContent = "خطا در آپلود";
            uploadStatus.style.color = "red";
            showError(error.message);
        } finally {
            uploadBtn.disabled = false;
        }
    });
}

