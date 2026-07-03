function getItemsStore(context) {
    return context.env.ITEMS || null;
}

function getReservationsStore(context) {
    return context.env.RESERVATIONS || null;
}

function getAdminToken(context) {
    return String(context.env.ADMIN_TOKEN || "").trim();
}

function isAuthorized(context) {
    const expectedToken = getAdminToken(context);
    const providedToken = String(
        context.request.headers.get("x-admin-token") || ""
    ).trim();

    return Boolean(expectedToken && providedToken && expectedToken === providedToken);
}

function buildError(message, status = 400) {
    return Response.json({ error: message }, { status });
}

function normalizeImages(images) {
    if (Array.isArray(images)) {
        return images
            .map((value) => String(value || "").trim())
            .filter(Boolean);
    }

    if (typeof images === "string") {
        return images
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean);
    }

    return [];
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
        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function loadItems(context, store) {
    const data = await store.get("items", "json");

    if (Array.isArray(data) && data.length) {
        return data;
    }

    return loadSeedItems(context);
}

async function saveItems(store, items) {
    const sortedItems = [...items].sort((a, b) => Number(a.id) - Number(b.id));
    await store.put("items", JSON.stringify(sortedItems));
    return sortedItems;
}

function validateItemInput(body, existingId = null) {
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const images = normalizeImages(body.images);

    if (!title) {
        throw new Error("title is required");
    }

    const id = existingId ?? Number(body.id || 0);

    return {
        id,
        slug: normalizeSlug(body.slug, id || "new"),
        title,
        description,
        images,
    };
}

export async function onRequestGet(context) {
    const store = getItemsStore(context);

    if (!store) {
        return buildError("ITEMS KV binding is not configured", 500);
    }

    const items = await loadItems(context, store);
    return Response.json(items.sort((a, b) => Number(a.id) - Number(b.id)));
}

export async function onRequestPost(context) {
    const store = getItemsStore(context);

    if (!store) {
        return buildError("ITEMS KV binding is not configured", 500);
    }

    if (!isAuthorized(context)) {
        return buildError("Unauthorized", 401);
    }

    try {
        const body = await context.request.json();
        const items = await loadItems(context, store);
        const nextId =
            items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;

        const item = validateItemInput({ ...body, id: nextId }, nextId);
        const updatedItems = await saveItems(store, [...items, item]);

        return Response.json({ success: true, item, items: updatedItems });
    } catch (error) {
        return buildError(error.message || "Invalid request", 400);
    }
}

export async function onRequestPut(context) {
    const store = getItemsStore(context);

    if (!store) {
        return buildError("ITEMS KV binding is not configured", 500);
    }

    if (!isAuthorized(context)) {
        return buildError("Unauthorized", 401);
    }

    try {
        const body = await context.request.json();
        const itemId = Number(body.id || 0);

        if (!itemId) {
            return buildError("id is required");
        }

        const items = await loadItems(context, store);
        const index = items.findIndex((item) => Number(item.id) === itemId);

        if (index === -1) {
            return buildError("Item not found", 404);
        }

        const currentItem = items[index];
        const item = validateItemInput(
            {
                ...currentItem,
                ...body,
                id: itemId,
            },
            itemId
        );

        items[index] = item;
        const updatedItems = await saveItems(store, items);

        return Response.json({ success: true, item, items: updatedItems });
    } catch (error) {
        return buildError(error.message || "Invalid request", 400);
    }
}

export async function onRequestDelete(context) {
    const store = getItemsStore(context);

    if (!store) {
        return buildError("ITEMS KV binding is not configured", 500);
    }

    if (!isAuthorized(context)) {
        return buildError("Unauthorized", 401);
    }

    try {
        const body = await context.request.json();
        const itemId = Number(body.id || 0);

        if (!itemId) {
            return buildError("id is required");
        }

        const items = await loadItems(context, store);
        const filteredItems = items.filter((item) => Number(item.id) !== itemId);

        if (filteredItems.length === items.length) {
            return buildError("Item not found", 404);
        }

        await saveItems(store, filteredItems);

        const reservationsStore = getReservationsStore(context);
        if (reservationsStore) {
            const reservations = (await reservationsStore.get("items", "json")) || {};
            delete reservations[String(itemId)];
            await reservationsStore.put("items", JSON.stringify(reservations));
        }

        return Response.json({ success: true, items: filteredItems });
    } catch (error) {
        return buildError(error.message || "Invalid request", 400);
    }
}
