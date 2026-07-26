export function slugify(category) {
  return category
    .toLowerCase()
    .replace(/&/g, "und")
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
