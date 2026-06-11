import { onRequestDelete as __api_reservations_js_onRequestDelete } from "C:\\Users\\Lenovo\\Desktop\\New folder\\functions\\api\\reservations.js"
import { onRequestGet as __api_reservations_js_onRequestGet } from "C:\\Users\\Lenovo\\Desktop\\New folder\\functions\\api\\reservations.js"
import { onRequestPost as __api_reservations_js_onRequestPost } from "C:\\Users\\Lenovo\\Desktop\\New folder\\functions\\api\\reservations.js"

export const routes = [
    {
      routePath: "/api/reservations",
      mountPath: "/api",
      method: "DELETE",
      middlewares: [],
      modules: [__api_reservations_js_onRequestDelete],
    },
  {
      routePath: "/api/reservations",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_reservations_js_onRequestGet],
    },
  {
      routePath: "/api/reservations",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_reservations_js_onRequestPost],
    },
  ]