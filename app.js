// پایه‌ی API روی Cloudflare Pages Functions
const API_BASE = "/api";

// عناصر DOM
const itemsContainer = document.getElementById("items-container");
const searchInput = document.getElementById("search-input");
const reserveDialog = document.getElementById("reserve-dialog");
const reserveForm = document.getElementById("reserve-form");
const reserveCancel = document.getElementById("reserve-cancel");

let allItems = []; // لیست هدایا (از items.json)
let reservationsMap = {}; // وضعیت رزروها (از /api/reservations)

// --- Utilities ---

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// --- Data fetching ---

// خواندن لیست هدایا از فایل استاتیک
async function fetchItems() {
    const apiResponse = await fetch(`${API_BASE}/items`);

    if (apiResponse.ok) {
        return apiResponse.json();
    }

    const staticResponse = await fetch("items.json");
    if (!staticResponse.ok) {
        throw new Error("خطا در خواندن لیست هدایا");
    }

    return staticResponse.json();
}


// خواندن وضعیت رزروها از API
async function fetchReservations() {
    const response = await fetch(`${API_BASE}/reservations`);
    if (!response.ok) {
        throw new Error("خطا در دریافت وضعیت رزروها");
    }

    const data = await response.json();
    return data || {};
}

// ثبت رزرو
async function reserveItem(itemId, name, note) {
    const response = await fetch(`${API_BASE}/reservations`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId, name, note }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 409) {
        throw new Error("این هدیه قبلاً رزرو شده است.");
    }

    if (!response.ok) {
        throw new Error(data.error || "خطا در ثبت رزرو");
    }

    return data;
}

// --- UI helpers ---

function createSlider(images, itemId) {
    if (!images || images.length === 0) {
        return `
      <div class="card-image no-image">
        <span>عکسی موجود نیست</span>
      </div>
    `;
    }

    const slides = images
        .map(
            (img, index) => `
        <div class="slide ${index === 0 ? "active" : ""}">
          <img src="${escapeHtml(img)}" alt="تصویر هدیه ${itemId}" />
        </div>
      `
        )
        .join("");

    const dots = images
        .map(
            (_, index) => `
        <button class="slider-dot ${index === 0 ? "active" : ""}" data-index="${index}" type="button"></button>
      `
        )
        .join("");

    const arrows =
        images.length > 1
            ? `
        <button class="slider-btn prev" type="button">›</button>
        <button class="slider-btn next" type="button">‹</button>
      `
            : "";

    const dotsHtml =
        images.length > 1
            ? `<div class="slider-dots">${dots}</div>`
            : "";

    return `
    <div class="card-image">
      <div class="slides">${slides}</div>
      ${arrows}
      ${dotsHtml}
    </div>
  `;
}

function createCard(item) {
    const reservation = reservationsMap[String(item.id)];
    const isReserved = Boolean(reservation && reservation.reserved);
    const storeLinks = Array.isArray(item.storeLinks) ? item.storeLinks.filter((link) => {
        try { return new URL(link).protocol === "https:"; } catch { return false; }
    }) : [];

    return `
    <article class="gift-card" data-id="${item.id}">
      ${createSlider(item.images, item.id)}

      <div class="card-content">
        <div class="card-top">
          <span class="status-badge ${isReserved ? "reserved" : "available"}">
            ${isReserved ? "رزرو شده" : "آزاد"}
          </span>

          <h3 class="card-title">${escapeHtml(item.title)}</h3>
        </div>

        <p class="card-description">${escapeHtml(item.description || "")}</p>

        ${item.priceRange || item.category ? `<div class="gift-meta">
          ${item.priceRange ? `<span>بازه قیمت: ${escapeHtml(item.priceRange)}</span>` : ""}
          ${item.category ? `<span>${escapeHtml(item.category)}</span>` : ""}
        </div>` : ""}
        ${storeLinks.length ? `<div class="gift-store-links">${storeLinks.map((link, index) => `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">خرید از فروشگاه ${index + 1}</a>`).join("")}</div>` : ""}

        <div class="card-actions">
          ${isReserved
            ? `
                <button
                  class="reserve-btn"
                  type="button"
                  disabled
                >
                  این هدیه رزرو شده است
                </button>
              `
            : `
                <button
                  class="reserve-btn"
                  type="button"
                  data-id="${item.id}"
                >
                  رزرو این هدیه
                </button>
              `
        }
        </div>
      </div>
    </article>
  `;
}

// --- Handlers ---

async function handleReserveClick(itemId) {
    reserveForm.reset();
    reserveDialog.showModal();
    const formResult = await new Promise((resolve) => {
        reserveForm.onsubmit = (event) => {
            event.preventDefault();
            const formData = new FormData(reserveForm);
            reserveDialog.close("confirm");
            resolve({ name: String(formData.get("name") || "").trim(), note: String(formData.get("note") || "").trim() });
        };
        reserveCancel.onclick = () => {
            reserveDialog.close("cancel");
            resolve(null);
        };
        reserveDialog.oncancel = () => resolve(null);
    });
    if (!formResult?.name) return;

    try {
        await reserveItem(itemId, formResult.name, formResult.note);
    } catch (error) {
        console.error(error);
        alert(error.message || "خطا در ثبت رزرو.");
        try {
            await refreshItems();
        } catch (refreshError) {
            console.error("Could not refresh gifts after reservation error.", refreshError);
        }
        return;
    }

    alert("رزرو با موفقیت ثبت شد.");
    try {
        await refreshItems();
    } catch (refreshError) {
        console.error("Reservation was saved, but the list could not be refreshed.", refreshError);
        alert("رزرو ثبت شد، اما تازه‌سازی فهرست ناموفق بود. صفحه را دوباره بارگذاری کنید.");
    }
}

function filterItems() {
    const query = searchInput.value.trim().toLowerCase();

    const filtered = allItems.filter((item) => {
        const title = String(item.title || "").toLowerCase();
        const description = String(item.description || "").toLowerCase();

        return title.includes(query) || description.includes(query);
    });

    renderItems(filtered);
}

async function refreshItems() {
    allItems = await fetchItems();
   
    try {
        reservationsMap = await fetchReservations();
    } catch (error) {
        console.warn(
            "Reservations API is not available. Showing items without reservations.",
            error
        );
        reservationsMap = {};
    }

    filterItems();
}

// --- DOM wiring ---

function setupReserveButtons() {
    const reserveButtons = document.querySelectorAll(".gift-card .reserve-btn:not([disabled])");

    reserveButtons.forEach((button) => {
        button.addEventListener("click", async () => {
            const itemId = Number(button.dataset.id);

            button.disabled = true;
            button.textContent = "در حال ثبت...";

            try {
                await handleReserveClick(itemId);
            } finally {
                if (button.isConnected) {
                    button.disabled = false;
                    button.textContent = "رزرو این هدیه";
                }
            }
        });
    });
}

function setupSliders() {
    const cards = document.querySelectorAll(".gift-card");

    cards.forEach((card) => {
        const slides = card.querySelectorAll(".slide");
        const dots = card.querySelectorAll(".slider-dot");
        const prevBtn = card.querySelector(".slider-btn.prev");
        const nextBtn = card.querySelector(".slider-btn.next");

        if (!slides.length || slides.length === 1) {
            return;
        }

        let currentIndex = 0;

        function updateSlider(index) {
            slides.forEach((slide, i) => {
                slide.classList.toggle("active", i === index);
            });

            dots.forEach((dot, i) => {
                dot.classList.toggle("active", i === index);
            });
        }

        prevBtn?.addEventListener("click", () => {
            currentIndex = (currentIndex - 1 + slides.length) % slides.length;
            updateSlider(currentIndex);
        });

        nextBtn?.addEventListener("click", () => {
            currentIndex = (currentIndex + 1) % slides.length;
            updateSlider(currentIndex);
        });

        dots.forEach((dot, index) => {
            dot.addEventListener("click", () => {
                currentIndex = index;
                updateSlider(currentIndex);
            });
        });
    });
}

function renderItems(items) {
    if (!items.length) {
        itemsContainer.innerHTML = `
      <div class="empty-state">
        <p>هیچ هدیه‌ای با این جستجو پیدا نشد.</p>
      </div>
    `;
        return;
    }

    itemsContainer.innerHTML = items.map(createCard).join("");
    setupSliders();
    setupReserveButtons();
}

// --- Init ---

async function init() {
    try {
        await refreshItems();
        searchInput.addEventListener("input", filterItems);
    } catch (error) {
        console.error(error);
        itemsContainer.innerHTML = `
      <div class="empty-state error">
        <p>خطا در دریافت اطلاعات.</p>
      </div>
    `;
    }
}

init();
