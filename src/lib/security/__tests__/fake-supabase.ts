/**
 * Minimal in-memory stand-in for the supabase-js query builder — just the
 * chain methods the placement/practice/completion paths use. Lets the
 * security tests exercise real engine code fully offline (vitest loads
 * .env.local, so an accidental real client would reach production).
 *
 * Semantics mirror PostgREST where the tests depend on them: filters are
 * ANDed, `update().select()` returns only the rows it changed, and a
 * filtered update that matches nothing changes nothing.
 */
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface RecordedWrite {
  table: string;
  op: "insert" | "update" | "upsert" | "delete";
  values: unknown;
}

export class FakeSupabase {
  readonly tables = new Map<string, Row[]>();
  readonly writes: RecordedWrite[] = [];
  readonly rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  rpcHandlers: Record<string, (args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }> = {};
  /** Column defaults applied on insert, like the real tables' DEFAULT clauses. */
  defaults: Record<string, Row> = {
    placement_attempts: { status: "in_progress", pending_question_id: null },
    practice_sessions: { status: "in_progress" },
  };
  /** Force a table's writes to fail, to test error handling. */
  failingWrites = new Set<string>();
  private idCounter = 0;

  table(name: string): Row[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }

  seed(name: string, rows: Row[]): void {
    this.table(name).push(...rows.map((r) => ({ ...r })));
  }

  nextId(): string {
    this.idCounter += 1;
    return `00000000-0000-4000-8000-${String(this.idCounter).padStart(12, "0")}`;
  }

  from(name: string): QueryBuilder {
    return new QueryBuilder(this, name);
  }

  async rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    const handler = this.rpcHandlers[fn];
    if (!handler) return { data: null, error: { message: `function ${fn} does not exist` } };
    return handler(args);
  }
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: unknown;
  private returning = false;
  private countOnly = false;
  private limitN: number | null = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;

  constructor(
    private readonly db: FakeSupabase,
    private readonly name: string,
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      if (options?.head) this.countOnly = true;
    } else {
      this.returning = true;
    }
    return this;
  }
  insert(values: unknown) {
    this.op = "insert";
    this.payload = values;
    return this;
  }
  upsert(values: unknown) {
    this.op = "upsert";
    this.payload = values;
    return this;
  }
  update(values: unknown) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((r) => (r[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  gte(column: string, value: string | number) {
    this.filters.push((r) => (r[column] as string | number) >= value);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }

  then<T1 = { data: unknown; error: { message: string } | null }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null; count?: number | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    return this.db.table(this.name).filter((r) => this.filters.every((f) => f(r)));
  }

  private shape(rows: Row[]) {
    if (this.singleMode === "single") {
      return rows.length === 1 ? { data: { ...rows[0] }, error: null } : { data: null, error: { message: "not exactly one row" } };
    }
    if (this.singleMode === "maybeSingle") return { data: rows[0] ? { ...rows[0] } : null, error: null };
    return { data: rows.map((r) => ({ ...r })), error: null };
  }

  private execute(): { data: unknown; error: { message: string } | null; count?: number | null } {
    if (this.op !== "select" && this.db.failingWrites.has(this.name)) {
      return { data: null, error: { message: `forced failure writing ${this.name}` } };
    }
    if (this.op === "select") {
      let rows = this.matching();
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        rows = [...rows].sort((a, b) => ((a[column] as number) - (b[column] as number)) * (ascending ? 1 : -1));
      }
      if (this.limitN !== null) rows = rows.slice(0, this.limitN);
      if (this.countOnly) return { data: null, error: null, count: rows.length };
      return this.shape(rows);
    }
    this.db.writes.push({ table: this.name, op: this.op, values: this.payload });
    if (this.op === "insert" || this.op === "upsert") {
      const values = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const inserted = values.map((v) => ({ id: this.db.nextId(), ...this.db.defaults[this.name], ...v }));
      this.db.table(this.name).push(...inserted);
      return this.returning ? this.shape(inserted) : { data: null, error: null };
    }
    if (this.op === "update") {
      const rows = this.matching();
      for (const r of rows) Object.assign(r, this.payload as Row);
      return this.returning ? this.shape(rows) : { data: null, error: null };
    }
    const doomed = new Set(this.matching());
    this.db.tables.set(this.name, this.db.table(this.name).filter((r) => !doomed.has(r)));
    return { data: null, error: null };
  }
}
