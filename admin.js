const API_BASE = "/api";
const TOKEN_STORAGE_KEY = "gift-admin-token";

const tokenInput = document.getElementById("admin-token");
const saveTokenBtn = document.getElementById("save-token-btn");
const logoutBtn = document.getElementById("logout-btn");
const itemForm = document.getElementById("item-form");
const itemIdInput = document.getElementById("item-id");
const titleInput = document.getElementById("item-title");
const slugInput = document.getElementById("item-slug");
const descriptionInput = document.getElementById("item-description");
const imagesInput = document.getElementById("item-images");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const submitBtn = document.getElementById("submit-btn");
const adminItems = document.getElementById("admin-items");
const adminStatus = document.getElementById("admin-status");

let items = [];
let reservationsMap = {};

function getToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function setToken(token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearToken() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function fetchItems() {
    const response = await fetch(`${API_BASE}/items`);
    if (!response.ok) {
        throw new Error("خطا در دریافت هدیه‌ها");
    }

    return response.json();
}

async function fetchReservations() {
    const response = await fetch(`${API_BASE}/reservations`);
    if (!response.ok) {
        return {};
    }

    return response.json();
}

async function sendItemRequest(method, body) {
    const token = getToken();

    if (!token) {
        throw new Error("ابتدا توکن ادمین را وارد کن.");
    }

    const response = await fetch(`${API_BASE}/items`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "x-admin-token": token,
        },
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
    submitBtn.textContent = "ویرایش هدیه";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function createAdminItemCard(item) {
    const reservation = reservationsMap[String(item.id)];
    const isReserved = Boolean(reservation && reservation.reserved);

    return `
        <article class="admin-item-card">
            <div class="admin-item-head">
                <div>
                    <h3 class="admin-item-title">${escapeHtml(item.title)}</h3>
                    <p class="admin-item-meta">ID: ${item.id} | slug: ${escapeHtml(item.slug || "")}</p>
                </div>
                <span class="status-badge ${isReserved ? "reserved" : "available"}">
                    ${isReserved ? "رزرو شده" : "آزاد"}
                </span>
            </div>

            <p class="admin-item-description">${escapeHtml(item.description || "")}</p>

            <p class="admin-item-meta">
                تعداد عکس‌ها: ${Array.isArray(item.images) ? item.images.length : 0}
            </p>

            <div class="admin-item-actions">
                <button class="admin-primary-btn edit-item-btn" type="button" data-id="${item.id}">
                    ویرایش
                </button>
                <button class="admin-danger-btn delete-item-btn" type="button" data-id="${item.id}">
                    حذف
                </button>
            </div>
        </article>
    `;
}

function renderItems() {
    if (!items.length) {
        adminItems.innerHTML = `
            <div class="empty-state">
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
                adminStatus.textContent = "هدیه با موفقیت حذف شد.";
                await refreshAdminData();
                resetForm();
            } catch (error) {
                adminStatus.textContent = error.message || "خطا در حذف هدیه.";
            }
        });
    });
}

async function refreshAdminData() {
    adminStatus.textContent = "در حال بارگذاری...";
    [items, reservationsMap] = await Promise.all([fetchItems(), fetchReservations()]);
    renderItems();
    adminStatus.textContent = `${items.length} هدیه موجود است.`;
}

saveTokenBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();

    if (!token) {
        adminStatus.textContent = "توکن ادمین را وارد کن.";
        return;
    }

    setToken(token);
    adminStatus.textContent = "توکن ذخیره شد.";
    await refreshAdminData();
});

logoutBtn.addEventListener("click", () => {
    clearToken();
    tokenInput.value = "";
    adminStatus.textContent = "توکن پاک شد.";
});

cancelEditBtn.addEventListener("click", () => {
    resetForm();
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
            adminStatus.textContent = "هدیه با موفقیت ویرایش شد.";
        } else {
            await sendItemRequest("POST", body);
            adminStatus.textContent = "هدیه جدید با موفقیت اضافه شد.";
        }

        resetForm();
        await refreshAdminData();
    } catch (error) {
        adminStatus.textContent = error.message || "خطا در ذخیره هدیه.";
    }
});

async function init() {
    const savedToken = getToken();
    if (savedToken) {
        tokenInput.value = savedToken;
    }

    try {
        await refreshAdminData();
    } catch (error) {
        adminStatus.textContent = error.message || "خطا در بارگذاری اطلاعات.";
    }
}

init();
