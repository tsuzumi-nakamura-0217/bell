import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTemplateHandler,
  deleteTemplateHandler,
  getTemplateHandler,
  listTemplatesHandler,
  updateTemplateHandler,
  withErrorHandling,
} from "@/server/handlers";
import { insertTemplate } from "@/server/templates-repo";

const db = env.DB;
const valid = { name: "LT大会", bells: [{ at: 300, count: 2 }, { at: 240, count: 1 }] };

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/templates", {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await db.exec("DELETE FROM templates");
});

describe("POST /api/templates", () => {
  it("201 と作成したテンプレートを返し、保存されたテンプレートはベルが時刻順", async () => {
    const res = await createTemplateHandler(db, jsonRequest("POST", valid), 1000);
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };
    const { id } = created;
    expect(id).toMatch(/^[a-z0-9]{10}$/);
    expect(created).toEqual({
      id,
      name: "LT大会",
      bells: [{ at: 240, count: 1 }, { at: 300, count: 2 }],
      createdAt: 1000,
      updatedAt: 1000,
    });

    const got = await getTemplateHandler(db, id);
    expect(await got.json()).toEqual({
      id,
      name: "LT大会",
      bells: [{ at: 240, count: 1 }, { at: 300, count: 2 }],
      createdAt: 1000,
      updatedAt: 1000,
    });
  });

  it("不正な入力は 400 と issues を返す", async () => {
    const res = await createTemplateHandler(db, jsonRequest("POST", { name: "", bells: [] }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: unknown[]; message: string }[] };
    expect(body.error).toBe("invalid");
    expect(body.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["name", "bells"]));
  });

  it("JSON として読めない本文は 400 invalid_json", async () => {
    const res = await createTemplateHandler(db, jsonRequest("POST", "{oops"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });
});

describe("insertTemplate", () => {
  it("ID が衝突したら作り直す", async () => {
    await insertTemplate(db, valid, 1, () => "dupdupdup1");
    const ids = ["dupdupdup1", "dupdupdup1", "freshid001"];
    const created = await insertTemplate(db, valid, 2, () => ids.shift()!);
    expect(created.id).toBe("freshid001");
  });

  it("3回続けて衝突したらエラー", async () => {
    await insertTemplate(db, valid, 1, () => "dupdupdup1");
    await expect(insertTemplate(db, valid, 2, () => "dupdupdup1")).rejects.toThrow();
  });
});

describe("GET /api/templates", () => {
  it("全テンプレートを作成日の新しい順に返す", async () => {
    await insertTemplate(db, { ...valid, name: "古い" }, 1000);
    await insertTemplate(db, { ...valid, name: "新しい" }, 3000);
    await insertTemplate(db, { ...valid, name: "中間" }, 2000);
    const res = await listTemplatesHandler(db);
    expect(res.status).toBe(200);
    const list = (await res.json()) as { name: string; bells: unknown }[];
    expect(list.map((t) => t.name)).toEqual(["新しい", "中間", "古い"]);
    expect(list[0].bells).toEqual(valid.bells);
  });

  it("1件もなければ空配列", async () => {
    expect(await (await listTemplatesHandler(db)).json()).toEqual([]);
  });
});

describe("GET /api/templates/[id]", () => {
  it("存在しない id は 404", async () => {
    const res = await getTemplateHandler(db, "nope000000");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("PUT /api/templates/[id]", () => {
  it("上書きし、updatedAt だけ更新する", async () => {
    const created = await insertTemplate(db, valid, 1000);
    const res = await updateTemplateHandler(
      db,
      created.id,
      jsonRequest("PUT", { name: "改名", bells: [{ at: 60, count: 3 }] }),
      2000,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: created.id,
      name: "改名",
      bells: [{ at: 60, count: 3 }],
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it("存在しない id は 404、不正な入力は 400", async () => {
    expect((await updateTemplateHandler(db, "nope000000", jsonRequest("PUT", valid))).status).toBe(404);
    const created = await insertTemplate(db, valid, 1);
    expect((await updateTemplateHandler(db, created.id, jsonRequest("PUT", { name: "x" }))).status).toBe(400);
  });
});

describe("DELETE /api/templates/[id]", () => {
  it("204 を返し、その後の取得は 404", async () => {
    const created = await insertTemplate(db, valid, 1);
    const res = await deleteTemplateHandler(db, created.id);
    expect(res.status).toBe(204);
    expect((await getTemplateHandler(db, created.id)).status).toBe(404);
  });

  it("存在しない id は 404", async () => {
    expect((await deleteTemplateHandler(db, "nope000000")).status).toBe(404);
  });
});

describe("withErrorHandling", () => {
  it("例外は 500 internal に変換する", async () => {
    const res = await withErrorHandling(async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
  });
});
