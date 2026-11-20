function getItemsStore(context) {
    return context.env.ITEMS || null;
}

function getReservationsStore(context) {
    return context.env.RESERVATIONS || null;
}

function getAdminToken(context) {
    return String(context.env.ADMIN_TOKEN || "").trim();
}

function getProvidedToken(context) {
    return String(context.request.headers.get("x-admin-token") || "").trim();
}

function isAuthorized(context) {
    const expectedToken = getAdminToken(context);
    const providedToken = getProvidedToken(context);
    return Boolean(expectedToken && providedToken && expectedToken === providedToken);
}

function buildError(message, status = 400) {
    return Response.json({ error: message }, { status });
}

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_IMAGES = 8;
const MAX_LINKS = 5;
const MIN_PRICE_TOMAN = 1000;
const MAX_PRICE_TOMAN = 1000000000;

class RequestError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

async function readJson(request, maxBytes = MAX_REQUEST_BYTES) {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > maxBytes) throw new RequestError("حجم درخواست بیش از حد مجاز است.", 413);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RequestError("حجم درخواست بیش از حد مجاز است.", 413);
    let body;
    try { body = JSON.parse(text); } catch { throw new RequestError("بدنه درخواست JSON معتبر نیست."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("ساختار درخواست معتبر نیست.");
    return body;
}

function normalizeImages(images) {
    if (typeof images === "string") {
        const value = images.trim();
        if (value.startsWith("[")) {
            try { images = JSON.parse(value); } catch { /* accept newline separated links */ }
        }
    }
    if (Array.isArray(images)) {
        images = images.map((value) => String(value || "").trim()).filter(Boolean);
        if (images.length > MAX_IMAGES) throw new RequestError(`حداکثر ${MAX_IMAGES} تصویر برای هر هدیه مجاز است.`);
        return images.map((value) => {
            if (value.length > 2048) throw new RequestError("لینک تصویر بیش از حد طولانی است.");
            if (/^Images\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp|gif)$/i.test(value)) return value;
            let url;
            try { url = new URL(value); } catch { throw new RequestError("لینک تصویر معتبر نیست."); }
            if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") {
                throw new RequestError("تصویر فقط می‌تواند از مسیر محلی پروژه یا Cloudinary باشد.");
            }
            return url.toString();
        });
    }
    if (typeof images === "string") {
        return normalizeImages(images.split("\n").map((value) => value.trim()).filter(Boolean));
    }
    return [];
}

function normalizeLinks(value) {
    const links = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
    const result = links.map((link, index) => {
        if (typeof link === "string") {
            const url = link.trim();
            return url ? { title: `خرید از فروشگاه ${index + 1}`, url } : null;
        }
        if (!link || typeof link !== "object" || Array.isArray(link)) throw new RequestError("اطلاعات لینک فروشگاه معتبر نیست.");
        return {
            title: boundedText(link.title, "عنوان لینک فروشگاه", 80),
            url: String(link.url || "").trim(),
        };
    }).filter((link) => {
        if (!link) return false;
        if (!link.title && !link.url) return false;
        if (!link.title || !link.url) throw new RequestError("برای هر لینک فروشگاه، هم عنوان و هم نشانی را وارد کنید.");
        return true;
    });
    if (result.length > MAX_LINKS) throw new RequestError(`حداکثر ${MAX_LINKS} لینک فروشگاه مجاز است.`);
    return result.map((link) => {
        if (!link.title) throw new RequestError("عنوان هر لینک فروشگاه را وارد کنید.");
        if (link.url.length > 2048) throw new RequestError("لینک فروشگاه بیش از حد طولانی است.");
        let url;
        try { url = new URL(link.url); } catch { throw new RequestError("یکی از لینک‌های فروشگاه معتبر نیست."); }
        if (url.protocol !== "https:") throw new RequestError("لینک فروشگاه باید با HTTPS باشد.");
        return { title: link.title, url: url.toString() };
    });
}

function normalizePrice(value, field) {
    if (value === null || value === undefined || value === "") return null;
    if (!Number.isSafeInteger(value) || value < MIN_PRICE_TOMAN || value > MAX_PRICE_TOMAN) {
        throw new RequestError(`${field} باید بین ۱٬۰۰۰ تا ۱٬۰۰۰٬۰۰۰٬۰۰۰ تومان باشد.`);
    }
    return value;
}

async function validateCategorySelection(store, category, existingCategory = "") {
    if (!category || category === existingCategory) return;
    const saved = await store.get("categories", "json");
    if (saved !== null && (!Array.isArray(saved) || !saved.includes(category))) {
        throw new RequestError("این دسته‌بندی در فهرست اطلاعات پایه وجود ندارد.");
    }
}

function boundedText(value, field, limit) {
    if (value != null && typeof value !== "string") throw new RequestError(`${field} باید متن باشد.`);
    const text = String(value || "").trim();
    if (text.length > limit) throw new RequestError(`${field} نباید بیشتر از ${limit} نویسه باشد.`);
    return text;
}

function normalizeSlug(value, fallbackId) {
    const slug = String(value || "")
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9-_\s]/g, "")
        .replaceAll(/\s+/g, "-")
        .replaceAll(/-+/g, "-");

    return slug || `item-${fallbackId}`;
}

async function loadSeedItems(context) {
    const seedUrl = new URL("/items.json", context.request.url);
    try {
        const response = await fetch(seedUrl.toString());
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function loadItems(context, store) {
    const data = await store.get("items", "json");

    if (Array.isArray(data) && data.length) {
        return data.map(item => {
            let images = item.images;

            // مرحله ۱: اگر رشته است، پارس کن
            if (typeof images === "string") {
                try {
                    images = JSON.parse(images);
                } catch {
                    images = images ? [images] : [];
                }
            }

            // مرحله ۲: اگر هنوز آرایه است، داخلش را هم چک کن
            if (Array.isArray(images)) {
                images = images.flatMap(img => {
                    if (typeof img === "string") {
                        try {
                            const parsed = JSON.parse(img);
                            return Array.isArray(parsed) ? parsed : [img];
                        } catch {
                            return [img];
                        }
                    }
                    return Array.isArray(img) ? img : [img];
                });
            }

            return {
                ...item,
                images: Array.isArray(images) ? images.filter(Boolean) : [],
                storeLinks: Array.isArray(item.storeLinks) ? item.storeLinks.map((link, index) => (
                    typeof link === "string"
                        ? { title: `خرید از فروشگاه ${index + 1}`, url: link }
                        : link
                )) : [],
            };
        });
    }

    return loadSeedItems(context);
}



async function saveItems(store, items) {
    const sortedItems = [...items].sort((a, b) => Number(a.id) - Number(b.id));
    await store.put("items", JSON.stringify(sortedItems));
    return sortedItems;
}

function validateItemInput(body, existingId = null) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("اطلاعات هدیه معتبر نیست.");
    const title = boundedText(body.title, "عنوان", 120);
    const description = boundedText(body.description, "توضیحات", 2000);
    const slug = boundedText(body.slug, "اسلاگ", 120);
    const images = normalizeImages(body.images);
    const priceRange = boundedText(body.priceRange, "بازه قیمت قدیمی", 100);
    const priceMin = normalizePrice(body.priceMin, "حداقل قیمت");
    const priceMax = normalizePrice(body.priceMax, "حداکثر قیمت");
    if ((priceMin === null) !== (priceMax === null)) throw new RequestError("هر دو حداقل و حداکثر قیمت را وارد کنید.");
    if (priceMin !== null && priceMin > priceMax) throw new RequestError("حداقل قیمت نمی‌تواند از حداکثر قیمت بیشتر باشد.");
    const category = boundedText(body.category, "دسته‌بندی/اولویت", 60);
    const storeLinks = normalizeLinks(body.storeLinks);

    if (!title) throw new RequestError("عنوان هدیه را وارد کنید.");

    const id = existingId ?? Number(body.id || 0);

    return {
        id,
        slug: normalizeSlug(slug, id || "new"),
        title,
        description,
        images,
        priceMin,
        priceMax,
        priceRange,
        category,
        storeLinks,
    };
}

export async function onRequest(context) {
    const method = context.request.method.toUpperCase();

    // ==================== GET (عمومی - بدون نیاز به توکن) ====================
    if (method === "GET") {
        const url = new URL(context.request.url);
        const verifyOnly = url.searchParams.get("verify") === "1";

        // فقط حالت verify=1 نیاز به احراز هویت دارد
        if (verifyOnly) {
            if (!isAuthorized(context)) {
                return buildError("Unauthorized", 401);
            }
            return Response.json({ success: true, authorized: true });
        }

        const store = getItemsStore(context);
        if (!store) {
            return buildError("ITEMS KV binding is not configured", 500);
        }

        const items = await loadItems(context, store);
        return Response.json(items.sort((a, b) => Number(a.id) - Number(b.id)));
    }

    // ==================== POST / PUT / DELETE (فقط ادمین) ====================
    if (method === "POST" || method === "PUT" || method === "DELETE") {
        const store = getItemsStore(context);
        if (!store) {
            return buildError("ITEMS KV binding is not configured", 500);
        }

        if (!isAuthorized(context)) {
            return buildError("Unauthorized", 401);
        }
    }

    // ==================== POST ====================
    if (method === "POST") {
        try {
            const body = await readJson(context.request);
            const store = getItemsStore(context);
            const items = await loadItems(context, store);

            const nextId = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;

            const item = validateItemInput({ ...body, id: nextId }, nextId);
            await validateCategorySelection(store, item.category);
            const updatedItems = await saveItems(store, [...items, item]);

            return Response.json({ success: true, item, items: updatedItems });
        } catch (error) {
            return buildError(error.message || "ذخیره هدیه ممکن نشد.", error.status || 500);
        }
    }

    // ==================== PUT ====================
    if (method === "PUT") {
        try {
            const body = await readJson(context.request);
            const itemId = Number(body.id || 0);

            if (!Number.isSafeInteger(itemId) || itemId < 1) return buildError("شناسه هدیه معتبر نیست.");

            const store = getItemsStore(context);
            const items = await loadItems(context, store);
            const index = items.findIndex((item) => Number(item.id) === itemId);

            if (index === -1) return buildError("Item not found", 404);

            const currentItem = items[index];
            const item = validateItemInput({ ...currentItem, ...body, id: itemId }, itemId);
            await validateCategorySelection(store, item.category, currentItem.category || "");

            items[index] = item;
            const updatedItems = await saveItems(store, items);

            return Response.json({ success: true, item, items: updatedItems });
        } catch (error) {
            return buildError(error.message || "ویرایش هدیه ممکن نشد.", error.status || 500);
        }
    }

    // ==================== DELETE ====================
    if (method === "DELETE") {
        try {
            const body = await readJson(context.request);
            const itemId = Number(body.id || 0);

            if (!Number.isSafeInteger(itemId) || itemId < 1) return buildError("شناسه هدیه معتبر نیست.");

            const store = getItemsStore(context);
            const items = await loadItems(context, store);
            const filteredItems = items.filter((item) => Number(item.id) !== itemId);

            if (filteredItems.length === items.length) {
                return buildError("Item not found", 404);
            }

            const reservationsStore = getReservationsStore(context);
            if (reservationsStore) {
                const reservations = (await reservationsStore.get("items", "json")) || {};
                if (reservations[String(itemId)]?.reserved) {
                    return buildError("ابتدا رزرو این هدیه را آزاد کنید؛ هدیه رزروشده قابل حذف نیست.", 409);
                }
            }

            await saveItems(store, filteredItems);

            if (reservationsStore) {
                const reservations = (await reservationsStore.get("items", "json")) || {};
                delete reservations[String(itemId)];
                await reservationsStore.put("items", JSON.stringify(reservations));
            }

            return Response.json({ success: true, items: filteredItems });
        } catch (error) {
            return buildError(error.message || "حذف هدیه ممکن نشد.", error.status || 500);
        }
    }

    return buildError("Method not allowed", 405);
}
