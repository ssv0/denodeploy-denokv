var settingsShare = Deno.env.get("SETTINGSSHARE");
import * as Earthstar from "https://deno.land/x/earthstar@v10.2.2/mod.ts";
const kv = await Deno.openKv();
const listenToPort = 8081 // probably irrelevant for deno deploy


let logger = new Earthstar.Logger("storage driver denoKVStorage", "gold");

// modded localstorage es5 docdriver to support denokv ================================================================================
type SerializedDriverDocs = { 
  byPathAndAuthor: Record<string, Earthstar.DocBase<string>>;
  byPathNewestFirst: Record<Earthstar.Path, Earthstar.DocBase<string>[]>;
  latestDocsByPath: Record<string, Earthstar.DocBase<string>>;
};

function isSerializedDriverDocs(value: any): value is SerializedDriverDocs {
  // check if data we've loaded from denoKVStorage is actually in the format we expect
  if (typeof value !== "object") {
    return false;
  }
  return ("byPathAndAuthor" in value && "byPathNewestFirst" in value);
}

/** A replica driver which persists to DenoKVStorage, which stores a maximum of five megabytes per domain. If you're storing multiple shares, this limit will be divided among all their replicas.
 * Works in browsers and Deno.
 */
export class DocDriverDenoKVStorage extends Earthstar.DocDriverMemory {
  _denoKVStorageKeyConfig: string;
  _denoKVStorageKeyDocs: string;

  /**
   * @param share - The address of the share the replica belongs to.
   * @param key - An optional key you can use to differentiate storage for the same share on the same device.
   */
  constructor(share: Earthstar.ShareAddress, key?: string) {
    super(share);
    logger.debug("constructor");

    // each config item starts with this prefix and gets its own entry in deno kv
    this._denoKVStorageKeyConfig = `earthstar:config:${share}${
      key ? `:${key}` : ""
    }`;
    // but all docs are stored together inside this one item, as a giant JSON object (copied localstorage driver, maybe a different design is better)
    this._denoKVStorageKeyDocs = `earthstar:documents:${share}${
      key ? `:${key}` : ""
    }`;
	
	let existingData;
	kv.get([this._denoKVStorageKeyDocs]).then(result => {
		existingData = result.value;
	});

    if (existingData !== undefined) {
      logger.debug("...constructor: loading data from denoKVStorage");
      const parsed = JSON.parse(existingData);

      if (!isSerializedDriverDocs(parsed)) {
        console.warn(
          `denoKVStorage data could not be parsed for share ${share}`,
        );
        return;
      }

      this.docByPathAndAuthor = new Map(
        Object.entries(parsed.byPathAndAuthor),
      );
      this.docsByPathNewestFirst = new Map(
        Object.entries(parsed.byPathNewestFirst),
      );
      this.latestDocsByPath = new Map(Object.entries(parsed.latestDocsByPath));

      const localIndexes = Array.from(this.docByPathAndAuthor.values()).map((
        doc,
      ) => doc._localIndex as number);
      this._maxLocalIndex = Math.max(...localIndexes);
    } else {
      logger.debug(
        "...constructor: there was no existing data in denoKVStorage",
      );
    }

    logger.debug("...constructor is done.");
  }

  //--------------------------------------------------
  // LIFECYCLE

  // isClosed(): inherited
  async close(erase: boolean) {
    logger.debug("close");
    if (this._isClosed) throw new Earthstar.ReplicaIsClosedError();
    if (erase) {
      logger.debug("...close: and erase");
      this._configKv = {};
      this._maxLocalIndex = -1;
      this.docsByPathNewestFirst.clear();
      this.docByPathAndAuthor.clear();

      logger.debug("...close: erasing denoKVStorage");

      await kv.delete([this._denoKVStorageKeyDocs]);
      for (const key of this._listConfigKeysSync()) {
        this._deleteConfigSync(key);
      }
      logger.debug("...close: erasing is done");
    }
    this._isClosed = true;
    logger.debug("...close is done.");

    return Promise.resolve();
  }

  //--------------------------------------------------
  // CONFIG


  async getConfig(key: string): Promise<string | undefined> {
    if (this._isClosed) throw new Earthstar.ReplicaIsClosedError();
    key = [this._denoKVStorageKeyConfig,key];
    let result = await kv.get(key);
    return result.value === null ? undefined : result;
  }

  async setConfig(key: string, value: string): Promise<void> {
    if (this._isClosed) throw new Earthstar.ReplicaIsClosedError();
    key = [this._denoKVStorageKeyConfig,key];
    await kv.set(key, value);
  }

  async listConfigKeys(): Promise<string[]> {
    if (this._isClosed) throw new Earthstar.ReplicaIsClosedError();
    let keys = await kv.list()
      .filter((key) => key[0]=this._denoKVStorageKeyConfig);
    keys.sort();
    return keys;
  }

  async deleteConfig(key: string): Promise<boolean> {
    if (this._isClosed) throw new Earthstar.ReplicaIsClosedError();
    let hadIt = await this.getConfig(key);
    key = [this._denoKVStorageKeyConfig,key];
    await kv.delete(key);
    return hadIt !== undefined;
  }


  //--------------------------------------------------
  // GET

  // getMaxLocalIndex(): inherited
  // queryDocs(query: Query): inherited

  //--------------------------------------------------
  // SET

  async upsert<FormatType extends string, DocType extends Earthstar.DocBase<FormatType>>(
    doc: DocType,
  ): Promise<DocType> {
    if (this._isClosed) throw new Earthstar.ReplicaIsClosedError();

    const upsertedDoc = await super.upsert(doc);

    // After every upsert, for now, we save everything
    // to denoKVStorage as a single giant JSON attachment.
    // TODO: debounce this, only do it every 1 second or something

    const docsToBeSerialised: SerializedDriverDocs = {
      byPathAndAuthor: Object.fromEntries(this.docByPathAndAuthor),
      byPathNewestFirst: Object.fromEntries(this.docsByPathNewestFirst),
      latestDocsByPath: Object.fromEntries(this.latestDocsByPath),
    };

    await kv.set(
      [this._denoKVStorageKeyDocs],
      JSON.stringify(docsToBeSerialised),
    );

    return upsertedDoc;
  }
}
//-------------------

class ReplicaDriverDenoKVStorage implements IReplicaDriver {
  docDriver: IReplicaDocDriver;
  attachmentDriver: IReplicaAttachmentDriver;

  constructor(shareAddress: ShareAddress, namespace?: string) {
    this.docDriver = new DocDriverDenoKVStorage(shareAddress, namespace);
    this.attachmentDriver = new Earthstar.AttachmentDriverMemory(
      shareAddress,
      namespace,
    );
  }
}
//-------------------



settingsShare= settingsShare.trim();
if (settingsShare.startsWith("earthstar://")) { //then it's an invite 
	const p = await Earthstar.parseInvitationURL(settingsShare);
        settingsShare=p.shareAddress; 
}

new Earthstar.Server([
	new Earthstar.ExtensionServerSettings({
		settingsShare: settingsShare,
		onCreateReplica: (address) => {
			console.log(`Creating replica for ${address}...`);

			return new Earthstar.Replica({
				driver: new ReplicaDriverDenoKVStorage(address),
			});
		},
	}),  new Earthstar.ExtensionSyncWeb(),
],{ port: listenToPort }
);


