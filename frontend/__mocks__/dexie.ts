class FakeTable {
  bulkPut() { return Promise.resolve(); }
  bulkGet() { return Promise.resolve([] as any[]); }
  bulkDelete() { return Promise.resolve(); }
  toArray() { return Promise.resolve([] as any[]); }
  where() {
    return {
      below: () => ({
        and: () => ({ toArray: () => Promise.resolve([] as any[]) }),
      }),
    };
  }
  clear() { return Promise.resolve(); }
}

class Dexie {
  name: string;
  _tables: Record<string, FakeTable>;
  constructor(name: string) {
    this.name = name;
    this._tables = {};
  }
  version() {
    return { stores: () => ({}) };
  }
  table(name: string) {
    if (!this._tables[name]) this._tables[name] = new FakeTable();
    return this._tables[name];
  }
  delete() {
    this._tables = {};
    return Promise.resolve();
  }
}

export { Dexie, FakeTable as Table };
export default Dexie;
