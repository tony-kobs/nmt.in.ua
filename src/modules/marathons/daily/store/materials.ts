import "server-only";

import { withConn, type Conn } from "./db";
import type { Material, MaterialType } from "./types";

export async function listMaterials(dayId: number, getConnection?: Conn): Promise<Material[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      id: number;
      sort_order: number;
      material_type: MaterialType;
      url_or_body: string;
    }>(
      `SELECT id, sort_order, material_type, url_or_body
       FROM marathon_day_materials WHERE day_id = ? ORDER BY sort_order`,
      [dayId],
    );
    return rows.map((row) => ({
      id: row.id,
      order: row.sort_order,
      type: row.material_type,
      urlOrBody: row.url_or_body,
    }));
  }, getConnection);
}

export async function insertMaterial(
  dayId: number,
  input: Omit<Material, "id">,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_day_materials (day_id, sort_order, material_type, url_or_body)
       VALUES (?, ?, ?, ?)`,
      [dayId, input.order, input.type, input.urlOrBody],
    );
  }, getConnection);
}

export async function deleteMaterial(
  dayId: number,
  materialId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_day_materials WHERE id = ? AND day_id = ?`,
      [materialId, dayId],
    );
  }, getConnection);
}

export async function updateMaterial(
  dayId: number,
  materialId: number,
  input: Omit<Material, "id">,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_day_materials
       SET sort_order = ?, material_type = ?, url_or_body = ?
       WHERE id = ? AND day_id = ?`,
      [input.order, input.type, input.urlOrBody, materialId, dayId],
    );
  }, getConnection);
}
