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
// HTTP では音色を省略できる（既定は卓上ベル）。リポジトリに直接入れるときは音色が必須
const valid = { name: "LT大会", bells: [{ at: 300, count: 2 }, { at: 240, count: 1 }] };
const validInput = { ...valid, sound: "desk-bell" as const };

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
      sound: "desk-bell",
      createdAt: 1000,
      updatedAt: 1000,
    });

    const got = await getTemplateHandler(db, id);
    expect(await got.json()).toEqual({
      id,
      name: "LT大会",
      bells: [{ at: 240, count: 1 }, { at: 300, count: 2 }],
      sound: "desk-bell",
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

describe("音色", () => {
  it("指定した音色を保存し、取得・一覧・更新で返す", async () => {
    const res = await createTemplateHandler(db, jsonRequest("POST", { ...valid, sound: "gong" }));
    const { id } = (await res.json()) as { id: string };
    expect(((await (await getTemplateHandler(db, id)).json()) as { sound: string }).sound).toBe("gong");
    expect(((await (await listTemplatesHandler(db)).json()) as { sound: string }[])[0].sound).toBe("gong");

    const updated = await updateTemplateHandler(db, id, jsonRequest("PUT", { ...valid, sound: "beep" }));
    expect(((await updated.json()) as { sound: string }).sound).toBe("beep");
  });

  it("知らない音色は 400", async () => {
    const res = await createTemplateHandler(db, jsonRequest("POST", { ...valid, sound: "trumpet" }));
    expect(res.status).toBe(400);
  });

  it("音色の列がない時代に作られた行（列の既定値）は卓上ベルとして返す", async () => {
    await db
      .prepare("INSERT INTO templates (id, name, bells, created_at, updated_at) VALUES ('legacy0001', '旧', ?1, 1, 1)")
      .bind(JSON.stringify(valid.bells))
      .run();
    expect(((await (await getTemplateHandler(db, "legacy0001")).json()) as { sound: string }).sound).toBe("desk-bell");
  });
});

describe("insertTemplate", () => {
  it("ID が衝突したら作り直す", async () => {
    await insertTemplate(db, validInput, 1, () => "dupdupdup1");
    const ids = ["dupdupdup1", "dupdupdup1", "freshid001"];
    const created = await insertTemplate(db, validInput, 2, () => ids.shift()!);
    expect(created.id).toBe("freshid001");
  });

  it("3回続けて衝突したらエラー", async () => {
    await insertTemplate(db, validInput, 1, () => "dupdupdup1");
    await expect(insertTemplate(db, validInput, 2, () => "dupdupdup1")).rejects.toThrow();
  });
});

describe("GET /api/templates", () => {
  it("全テンプレートを作成日の新しい順に返す", async () => {
    await insertTemplate(db, { ...validInput, name: "古い" }, 1000);
    await insertTemplate(db, { ...validInput, name: "新しい" }, 3000);
    await insertTemplate(db, { ...validInput, name: "中間" }, 2000);
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
    const created = await insertTemplate(db, validInput, 1000);
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
      sound: "desk-bell",
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it("存在しない id は 404、不正な入力は 400", async () => {
    expect((await updateTemplateHandler(db, "nope000000", jsonRequest("PUT", valid))).status).toBe(404);
    const created = await insertTemplate(db, validInput, 1);
    expect((await updateTemplateHandler(db, created.id, jsonRequest("PUT", { name: "x" }))).status).toBe(400);
  });
});

describe("DELETE /api/templates/[id]", () => {
  it("204 を返し、その後の取得は 404", async () => {
    const created = await insertTemplate(db, validInput, 1);
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
