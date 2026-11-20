import "server-only";
import { randomUUID } from "crypto";
import { adminDb, adminStorage, firebaseConfigured } from "./firebase-admin";
import type { Member, Org } from "../types";

/**
 * One storage interface with two implementations:
 *  - FirestoreStore: orgs/{orgId}/{collection}/{id} via the Admin SDK (clients never touch Firestore directly),
 *    files in Firebase Storage
 *  - MemoryStore: demo mode, seeded on first use, lives for the lifetime of the server process
 */
export type Collection =
  | "parties" | "transactions" | "bills" | "invoices" | "journal" | "audit" | "members"
  | "items" | "credit_notes" | "recurring" | "bank_lines";

/** A write in an atomic batch: set a document, or delete it. */
export type Op = { col: Collection; doc: { id: string }; delete?: boolean };

export interface Store {
  getOrg(orgId: string): Promise<Org | null>;
  saveOrg(org: Org): Promise<void>;
  /** Atomically increments and returns a named counter on the org (e.g. invoice numbers per financial year). */
  nextSequence(orgId: string, key: string): Promise<number>;
  getMember(uid: string): Promise<Member | null>;
  saveMember(m: Member): Promise<void>;
  deleteMember(m: Member): Promise<void>;
  list<T>(orgId: string, col: Collection): Promise<T[]>;
  get<T>(orgId: string, col: Collection, id: string): Promise<T | null>;
  put<T extends { id: string }>(orgId: string, col: Collection, doc: T): Promise<T>;
  /** Writes (and deletes) several docs atomically, so a document and its journal entries always land together. */
  putMany(orgId: string, ops: Op[]): Promise<void>;
  listOrgIds(): Promise<string[]>;
  saveFile(path: string, data: Buffer, contentType: string): Promise<void>;
  readFile(path: string): Promise<{ data: Buffer; contentType: string } | null>;
}

export const newId = () => randomUUID().replace(/-/g, "").slice(0, 20);

// Firestore rejects `undefined` field values.
const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

class FirestoreStore implements Store {
  private db = adminDb();
  private org(orgId: string) { return this.db.collection("orgs").doc(orgId); }
  async getOrg(orgId: string) {
    const s = await this.org(orgId).get();
    return s.exists ? (s.data() as Org) : null;
  }
  async saveOrg(org: Org) {
    // Never overwrite counters from a stale copy: sequences are only changed by nextSequence.
    const { sequences: _ignored, ...rest } = org; // eslint-disable-line @typescript-eslint/no-unused-vars
    await this.org(org.id).set(clean(rest), { merge: true });
  }
  async nextSequence(orgId: string, key: string) {
    const ref = this.org(orgId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const seqs = ((snap.data() as Org | undefined)?.sequences ?? {}) as Record<string, number>;
      const next = (seqs[key] ?? 0) + 1;
      tx.set(ref, { sequences: { [key]: next } }, { merge: true });
      return next;
    });
  }
  async getMember(uid: string) {
    const s = await this.db.collection("members").doc(uid).get();
    return s.exists ? (s.data() as Member) : null;
  }
  async saveMember(m: Member) {
    // Top-level index for uid → org lookup, plus a copy under the org for team listing.
    const b = this.db.batch();
    b.set(this.db.collection("members").doc(m.id), clean(m));
    b.set(this.org(m.orgId).collection("members").doc(m.id), clean(m));
    await b.commit();
  }
  async deleteMember(m: Member) {
    const b = this.db.batch();
    b.delete(this.db.collection("members").doc(m.id));
    b.delete(this.org(m.orgId).collection("members").doc(m.id));
    await b.commit();
  }
  async list<T>(orgId: string, col: Collection) {
    const s = await this.org(orgId).collection(col).get();
    return s.docs.map((d) => d.data() as T);
  }
  async get<T>(orgId: string, col: Collection, id: string) {
    const s = await this.org(orgId).collection(col).doc(id).get();
    return s.exists ? (s.data() as T) : null;
  }
  async put<T extends { id: string }>(orgId: string, col: Collection, doc: T) {
    await this.org(orgId).collection(col).doc(doc.id).set(clean(doc));
    return doc;
  }
  async putMany(orgId: string, ops: Op[]) {
    for (let i = 0; i < ops.length; i += 450) {
      const b = this.db.batch();
      for (const { col, doc, delete: del } of ops.slice(i, i + 450)) {
        const ref = this.org(orgId).collection(col).doc(doc.id);
        if (del) b.delete(ref);
        else b.set(ref, clean(doc));
      }
      await b.commit();
    }
  }
  async listOrgIds() {
    const refs = await this.db.collection("orgs").listDocuments();
    return refs.map((r) => r.id);
  }
  async saveFile(path: string, data: Buffer, contentType: string) {
    await adminStorage().bucket().file(path).save(data, { contentType, resumable: false });
  }
  async readFile(path: string) {
    const f = adminStorage().bucket().file(path);
    const [exists] = await f.exists();
    if (!exists) return null;
    const [[data], [meta]] = await Promise.all([f.download(), f.getMetadata()]);
    return { data, contentType: meta.contentType ?? "application/octet-stream" };
  }
}

type Mem = {
  orgs: Map<string, Org>; members: Map<string, Member>; data: Map<string, Map<string, unknown>>;
  files: Map<string, { data: Buffer; contentType: string }>;
};

class MemoryStore implements Store {
  private m: Mem;
  constructor() {
    const g = globalThis as unknown as { __ledgerlyMem?: Mem };
    g.__ledgerlyMem ??= { orgs: new Map(), members: new Map(), data: new Map(), files: new Map() };
    g.__ledgerlyMem.files ??= new Map();
    this.m = g.__ledgerlyMem;
  }
  private bucket(orgId: string, col: Collection) {
    const k = `${orgId}/${col}`;
    if (!this.m.data.has(k)) this.m.data.set(k, new Map());
    return this.m.data.get(k)!;
  }
  async getOrg(orgId: string) { const o = this.m.orgs.get(orgId); return o ? clean(o) : null; }
  async saveOrg(org: Org) {
    const prev = this.m.orgs.get(org.id);
    this.m.orgs.set(org.id, { ...clean(org), sequences: prev?.sequences ?? org.sequences ?? {} });
  }
  async nextSequence(orgId: string, key: string) {
    // Single-threaded event loop: read-increment-write here cannot interleave.
    const org = this.m.orgs.get(orgId);
    if (!org) throw new Error("Organisation not found");
    org.sequences = { ...(org.sequences ?? {}), [key]: (org.sequences?.[key] ?? 0) + 1 };
    return org.sequences[key];
  }
  async getMember(uid: string) { const v = this.m.members.get(uid); return v ? clean(v) : null; }
  async saveMember(mem: Member) {
    this.m.members.set(mem.id, clean(mem));
    this.bucket(mem.orgId, "members").set(mem.id, clean(mem));
  }
  async deleteMember(mem: Member) {
    this.m.members.delete(mem.id);
    this.bucket(mem.orgId, "members").delete(mem.id);
  }
  async list<T>(orgId: string, col: Collection) { return [...this.bucket(orgId, col).values()].map((v) => clean(v) as T); }
  async get<T>(orgId: string, col: Collection, id: string) {
    const v = this.bucket(orgId, col).get(id);
    return v ? (clean(v) as T) : null;
  }
  async put<T extends { id: string }>(orgId: string, col: Collection, doc: T) {
    this.bucket(orgId, col).set(doc.id, clean(doc));
    return doc;
  }
  async putMany(orgId: string, ops: Op[]) {
    for (const { col, doc, delete: del } of ops) {
      if (del) this.bucket(orgId, col).delete(doc.id);
      else this.bucket(orgId, col).set(doc.id, clean(doc));
    }
  }
  async listOrgIds() { return [...this.m.orgs.keys()]; }
  async saveFile(path: string, data: Buffer, contentType: string) { this.m.files.set(path, { data, contentType }); }
  async readFile(path: string) { return this.m.files.get(path) ?? null; }
}

let store: Store | undefined;
export function getStore(): Store {
  store ??= firebaseConfigured() ? new FirestoreStore() : new MemoryStore();
  return store;
}

