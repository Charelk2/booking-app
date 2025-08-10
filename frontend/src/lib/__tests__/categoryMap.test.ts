import { UI_CATEGORIES, UI_CATEGORY_TO_ID } from "@/lib/categoryMap";

describe("categoryMap", () => {
  it("maps each category value to its explicit id", () => {
    UI_CATEGORIES.forEach((cat) => {
      expect(UI_CATEGORY_TO_ID[cat.value]).toBe(cat.id);
    });
  });
});
