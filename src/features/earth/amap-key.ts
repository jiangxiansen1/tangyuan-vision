/**
 * AMap "Web service" key for the basemap patch.
 *
 * WHY THIS IS A PLAIN CONSTANT AND NOT AN ENVIRONMENT VARIABLE
 * An AMap web-service key is designed to be public: it rides in every request URL
 * the browser makes, so anyone using the site can read it from the network tab.
 * AMap's actual protection is a domain whitelist configured in their console, not
 * keeping the string out of the bundle.
 *
 * Keeping it here means there is exactly one place to change it, it works
 * identically in local builds and CI, and no secret plumbing is required. Leave it
 * empty to disable the basemap layer entirely 鈥?the globe then behaves exactly as
 * it did before the layer existed.
 *
 * If you would rather not commit it: set VITE_AMAP_KEY in CI and import.meta.env
 * wins (see readAmapKey).
 */
export const AMAP_KEY = '';
