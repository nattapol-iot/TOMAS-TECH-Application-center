import assert from "node:assert/strict";
import test from "node:test";
import { booleanQuery, clampedInteger, optionalPositiveLong, optionalText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText, } from "../src/http.js";
test("query helpers preserve the ASP.NET validation and clamping rules", () => {
    assert.equal(optionalText("  motor  ", 20, "Search"), "motor");
    assert.equal(optionalText("  ", 20, "Search"), null);
    assert.throws(() => optionalText("12345", 4, "Search"), /cannot exceed/);
    assert.equal(clampedInteger("0", 1, 1, 100), 1);
    assert.equal(clampedInteger("500", 1, 1, 100), 100);
    assert.equal(clampedInteger("bad", 25, 1, 100), 25);
});
test("write helpers validate text, integer, dates and SQL row versions", () => {
    assert.equal(requiredText("  Robot Cell  ", 20, "Project"), "Robot Cell");
    assert.equal(requiredInteger(75, "Probability", 0, 100), 75);
    assert.equal(parseDateOnly("2026-09-04", "Due date"), "2026-09-04");
    assert.equal(parseDateOnly(null, "Due date", true), null);
    assert.deepEqual(parseRowVersion("AQIDBAUGBwg="), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
    assert.throws(() => requiredText("", 20, "Project"), /required/);
    assert.throws(() => requiredInteger(101, "Probability", 0, 100), /invalid/);
    assert.throws(() => parseDateOnly("2026-02-30", "Due date"), /valid date/);
    assert.throws(() => parseRowVersion("not-base64"), /row version/);
});
test("identifier and boolean query helpers reject ambiguous values", () => {
    assert.equal(positiveLong("42", "Item id"), 42);
    assert.equal(optionalPositiveLong(undefined, "Supplier id"), null);
    assert.equal(booleanQuery("TRUE"), true);
    assert.equal(booleanQuery(undefined), false);
    assert.throws(() => positiveLong("1.5", "Item id"), /positive number/);
    assert.throws(() => booleanQuery("yes"), /true or false/);
});
//# sourceMappingURL=http.test.js.map