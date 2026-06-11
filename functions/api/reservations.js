function getReservationsStore(context) {
    const store = context.env.RESERVATIONS;

    if (!store) {
        return null;
    }

    return store;
}

export async function onRequestGet(context) {
    const store = getReservationsStore(context);

    if (!store) {
        return Response.json(
            { error: "RESERVATIONS KV binding is not configured" },
            { status: 500 }
        );
    }

    const data = await store.get("items", "json");
    return Response.json(data || {});
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
        const body = await context.request.json();
        const itemId = String(body.itemId || "").trim();

        if (!itemId) {
            return Response.json(
                { error: "itemId is required" },
                { status: 400 }
            );
        }

        const data = (await store.get("items", "json")) || {};
        const existingReservation = data[itemId];

        if (existingReservation && existingReservation.reserved) {
            return Response.json(
                { error: "Item already reserved" },
                { status: 409 }
            );
        }

        data[itemId] = {
            reserved: true,
            reservedAt: new Date().toISOString(),
        };

        await store.put("items", JSON.stringify(data));

        return Response.json({ success: true, reservations: data });
    } catch (error) {
        return Response.json(
            { error: "Invalid request" },
            { status: 500 }
        );
    }
}

export async function onRequestDelete() {
    return Response.json(
        { error: "Deleting reservations is not allowed" },
        { status: 405 }
    );
}
