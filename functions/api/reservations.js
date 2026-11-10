function getReservationsStore(context) {
    const store = context.env.RESERVATIONS;

    if (!store) {
        return null;
    }

    return store;
}

function getAdminToken(context) {
    const expected = String(context.env.ADMIN_TOKEN || "").trim();
    const provided = String(context.request.headers.get("x-admin-token") || "").trim();
    return Boolean(expected && provided && expected === provided);
}

function apiError(message, status = 400) {
    return Response.json({ error: message }, { status });
}

class InputError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

async function readJson(request, maxBytes = 16 * 1024) {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > maxBytes) throw new InputError("حجم درخواست بیش از حد مجاز است.", 413);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new InputError("حجم درخواست بیش از حد مجاز است.", 413);
    let body;
    try { body = JSON.parse(text); } catch { throw new InputError("بدنه درخواست معتبر نیست."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("ساختار درخواست معتبر نیست.");
    return body;
}

function normalizeReservationMap(data) {
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export async function onRequestGet(context) {
    const store = getReservationsStore(context);

    if (!store) {
        return Response.json(
            { error: "RESERVATIONS KV binding is not configured" },
            { status: 500 }
        );
    }

    try {
        const data = normalizeReservationMap(await store.get("items", "json"));
        if (getAdminToken(context)) return Response.json(data);
        const publicData = Object.fromEntries(Object.entries(data).map(([id, item]) => [id, { reserved: Boolean(item?.reserved) }]));
        return Response.json(publicData);
    } catch {
        return apiError("دریافت وضعیت رزروها ممکن نشد.", 500);
    }
}

export async function onRequestPost(context) {
    const store = getReservationsStore(context);

    if (!store) {
        return Response.json(
            { error: "RESERVATIONS KV binding is not configured" },
            { status: 500 }
        );
    }

    try {
        const body = await readJson(context.request);
        const itemId = String(body.itemId || "").trim();
        if (typeof body.name !== "string" || (body.note != null && typeof body.note !== "string")) {
            return apiError("نام و توضیحات باید متن باشند.", 400);
        }
        const name = body.name.trim();
        const note = String(body.note || "").trim();

        if (!/^\d{1,10}$/.test(itemId)) return apiError("شناسه هدیه معتبر نیست.", 400);
        if (name.length < 2 || name.length > 80) return apiError("نام باید بین ۲ تا ۸۰ نویسه باشد.", 400);
        if (note.length < 2 || note.length > 500) return apiError("توضیحات باید بین ۲ تا ۵۰۰ نویسه باشد.", 400);

        const itemsStore = context.env.ITEMS;
        if (!itemsStore) return apiError("ITEMS KV binding is not configured", 500);
        const items = await itemsStore.get("items", "json");
        if (!Array.isArray(items) || !items.some((item) => Number(item.id) === Number(itemId))) {
            return apiError("این هدیه پیدا نشد.", 404);
        }

        const data = normalizeReservationMap(await store.get("items", "json"));
        const existingReservation = data[itemId];

        if (existingReservation && existingReservation.reserved) {
            return Response.json(
                { error: "Item already reserved" },
                { status: 409 }
            );
        }

        data[itemId] = {
            reserved: true,
            name,
            note,
            reservedAt: new Date().toISOString(),
        };

        await store.put("items", JSON.stringify(data));

        return Response.json({ success: true, reservations: data });
    } catch (error) {
        return apiError(error.status ? error.message : "ثبت رزرو ممکن نشد.", error.status || 500);
    }
}

export async function onRequestDelete(context) {
    if (!getAdminToken(context)) return apiError("دسترسی غیرمجاز است.", 401);
    const store = getReservationsStore(context);
    if (!store) return apiError("RESERVATIONS KV binding is not configured", 500);
    try {
        const body = await readJson(context.request);
        const itemId = String(body.itemId || "").trim();
        if (!/^\d{1,10}$/.test(itemId)) return apiError("شناسه هدیه معتبر نیست.", 400);
        const data = normalizeReservationMap(await store.get("items", "json"));
        if (!data[itemId]?.reserved) return apiError("رزروی برای این هدیه ثبت نشده است.", 404);
        delete data[itemId];
        await store.put("items", JSON.stringify(data));
        return Response.json({ success: true });
    } catch (error) {
        return apiError(error.status ? error.message : "لغو رزرو ممکن نشد.", error.status || 500);
    }
}
