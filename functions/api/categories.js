function apiError(message, status = 400) {
    return Response.json({ error: message }, { status });
}

function isAuthorized(context) {
    const expected = String(context.env.ADMIN_TOKEN || "").trim();
    const provided = String(context.request.headers.get("x-admin-token") || "").trim();
    return Boolean(expected && provided && expected === provided);
}

async function readBody(request) {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 4096) throw new Error("حجم درخواست بیش از حد مجاز است.");
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 4096) throw new Error("حجم درخواست بیش از حد مجاز است.");
    try {
        const body = JSON.parse(text);
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
        return body;
    } catch {
        throw new Error("درخواست معتبر نیست.");
    }
}

function cleanName(value) {
    if (typeof value !== "string") throw new Error("نام دسته‌بندی را وارد کنید.");
    const name = value.trim();
    if (!name) throw new Error("نام دسته‌بندی را وارد کنید.");
    if (name.length > 60) throw new Error("نام دسته‌بندی نباید بیشتر از ۶۰ نویسه باشد.");
    return name;
}

function uniqueNames(names) {
    const seen = new Set();
    return names.filter((name) => {
        const key = name.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function onRequest(context) {
    const store = context.env.ITEMS;
    if (!store) return apiError("ITEMS KV binding is not configured", 500);
    if (!isAuthorized(context)) return apiError("Unauthorized", 401);

    try {
        const method = context.request.method.toUpperCase();
        const savedRaw = await store.get("categories", "json");
        const saved = Array.isArray(savedRaw) ? savedRaw : [];
        const items = (await store.get("items", "json")) || [];
        const legacy = Array.isArray(items) ? items.map((item) => item.category).filter((name) => typeof name === "string" && name.trim()) : [];
        const categories = uniqueNames([...(Array.isArray(saved) ? saved : []), ...legacy]);

        if (method === "GET") {
            if (savedRaw === null || categories.length !== saved.length) await store.put("categories", JSON.stringify(categories));
            return Response.json({ categories });
        }

        const body = await readBody(context.request);
        const name = cleanName(body.name);

        if (method === "POST") {
            if (categories.some((entry) => entry.toLocaleLowerCase() === name.toLocaleLowerCase())) {
                return Response.json({ success: true, categories });
            }
            if (categories.length >= 100) return apiError("حداکثر ۱۰۰ دسته‌بندی قابل ثبت است.");
            const updated = uniqueNames([...saved, ...legacy, name]);
            await store.put("categories", JSON.stringify(updated));
            return Response.json({ success: true, categories: uniqueNames([...updated, ...legacy]) });
        }

        if (method === "DELETE") {
            if (legacy.some((entry) => entry.toLocaleLowerCase() === name.toLocaleLowerCase())) {
                return apiError("این دسته‌بندی به یک یا چند هدیه متصل است؛ ابتدا هدیه‌ها را ویرایش کنید.", 409);
            }
            const updated = saved.filter((entry) => entry.toLocaleLowerCase() !== name.toLocaleLowerCase());
            await store.put("categories", JSON.stringify(updated));
            return Response.json({ success: true, categories: uniqueNames([...updated, ...legacy]) });
        }

        return apiError("Method not allowed", 405);
    } catch (error) {
        return apiError(error.message || "مدیریت دسته‌بندی انجام نشد.");
    }
}
