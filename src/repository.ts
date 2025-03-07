import { Pool } from "pg";
import { WalletAddress, IWalletAddressRepository } from "./wallet-address";
import {
  IncomingPayment,
  IncomingPaymentRepository,
  IncomingPaymentWithMicroPayments,
  LocalIncomingPaymentState,
  MicroPayment,
  OutgoingPayment,
  OutgoingPaymentRepository,
  OutgoingPaymentState,
  OutgoingPaymentWithMicroPayments,
  Quote,
  QuoteRepository,
  UpdateIncomingPaymentWithNewMicroPaymentRequest,
  UpdateOutgoingPaymentWithNewMicroPaymentRequest,
} from "./payment";
import {
  RemoteIncomingPaymentRepository,
  RemoteIncomingPayment,
} from "./remote-incoming-payment";
import { IlpPeer, PeerRepository } from "./ilp-peer";

// ==========================
// Wallet Address
// ==========================

export class WalletAddressRepository implements IWalletAddressRepository {
  constructor(
    private localCacheRepo: WalletAddressInMemoryRepository,
    // private distributedCacheRepo: WalletAddressRedisRepository // | WalletAddressMemCachedRespository
    private persistenceRepo: WalletAddressPsqlRepository // | WalletAddressMongoRepository
  ) {}

  public async fetchById(id: string): Promise<WalletAddress | undefined> {
    const cached = await this.localCacheRepo.fetchById(id);
    if (cached) return cached;

    const walletAddress = await this.persistenceRepo.fetchById(id);
    if (walletAddress) {
      await this.localCacheRepo.store(walletAddress);
    }
    return walletAddress;
  }

  public async exists(id: string): Promise<boolean> {
    const existsInCache = await this.localCacheRepo.exists(id);
    if (existsInCache) return true;

    return await this.persistenceRepo.exists(id);
  }

  public async store(walletAddress: WalletAddress): Promise<void> {
    await this.persistenceRepo.store(walletAddress);
    await this.localCacheRepo.store(walletAddress);
  }
}

export class WalletAddressInMemoryRepository
  implements IWalletAddressRepository
{
  map: Map<string, WalletAddress> = new Map();

  public async store(entity: WalletAddress): Promise<void> {
    this.map.set(entity.id, entity);
  }

  public async fetchById(id: string): Promise<WalletAddress | undefined> {
    return this.map.get(id);
  }

  public async exists(id: string): Promise<boolean> {
    return this.map.has(id);
  }
}

interface WalletAddressRecord {
  id: string;
  url: string;
  is_active: boolean;
  asset_code: string;
  asset_scale: number;
}

export class WalletAddressPsqlRepository implements IWalletAddressRepository {
  TABLE_NAME = "wallet_addresses";
  constructor(private pool: Pool) {}

  public async exists(id: string): Promise<boolean> {
    try {
      const res = await this.pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE id = $1)`,
        [id]
      );
      return res.rows[0].exists;
    } catch (error) {
      console.error("Error checking if wallet address exists:", error);
      throw error;
    }
  }

  public async store(walletAddress: WalletAddress): Promise<void> {
    try {
      const query = `
        INSERT INTO ${this.TABLE_NAME} (id, url, is_active, asset_code, asset_scale)
        VALUES ($1, $2, $3, $4, $5)
      `;

      const values = [
        walletAddress.id,
        walletAddress.url,
        walletAddress.isActive,
        walletAddress.assetCode,
        walletAddress.assetScale,
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error("Error storing wallet address:", error);
      throw error;
    }
  }

  public async fetchById(id: string): Promise<WalletAddress | undefined> {
    const res = await this.pool.query<WalletAddressRecord>(
      `SELECT id, url, is_active, asset_code, asset_scale FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];
    return {
      id: row.id,
      url: row.url,
      isActive: row.is_active,
      assetCode: row.asset_code,
      assetScale: row.asset_scale,
    };
  }
}

// ==========================
// Incoming Payment
// ==========================

interface IncomingPaymentRecord {
  id: string;
  expires_at: string;
  asset_code: string;
  asset_scale: number;
  incoming_amount: string | null;
  received_amount: string;
  state: string;
  wallet_address_id: string;
}

export class IncomingPaymentInMemoryRepository
  implements IncomingPaymentRepository
{
  private map: Map<string, IncomingPayment> = new Map();
  private microPaymentMap: Map<string, MicroPayment[]> = new Map();

  public async store(payment: IncomingPayment): Promise<void> {
    this.map.set(payment.id, payment);
  }

  public async fetchById(id: string): Promise<IncomingPayment | undefined> {
    return this.map.get(id);
  }

  public async exists(id: string): Promise<boolean> {
    return this.map.has(id);
  }

  public async updateWithNewMicroPayment(request: {
    id: string;
    state: LocalIncomingPaymentState;
    receivedAmount: bigint;
    microPayment: MicroPayment;
  }): Promise<void> {
    const { id, state, receivedAmount, microPayment } = request;
    const payment = this.map.get(id);
    if (!payment) {
      throw new Error(`IncomingPayment with id ${id} not found`);
    }

    payment.state = state;
    payment.receivedAmount = receivedAmount;

    if (!this.microPaymentMap.has(id)) {
      this.microPaymentMap.set(id, []);
    }
    this.microPaymentMap.get(id)!.push(microPayment);
  }
}

export class IncomingPaymentPsqlRepository
  implements IncomingPaymentRepository
{
  TABLE_NAME = "incoming_payments";
  MICRO_PAYMENT_TABLE_NAME = "incoming_micro_payments";

  constructor(private pool: Pool) {}

  public async exists(id: string): Promise<boolean> {
    try {
      const res = await this.pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE id = $1)`,
        [id]
      );
      return res.rows[0].exists;
    } catch (error) {
      console.error("Error checking if wallet address exists:", error);
      throw error;
    }
  }

  public async store(incomingPayment: IncomingPayment): Promise<void> {
    try {
      const query = `
        INSERT INTO ${this.TABLE_NAME} 
        (id, expires_at, asset_code, asset_scale, incoming_amount, received_amount, state, wallet_address_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      const values = [
        incomingPayment.id,
        incomingPayment.expiresAt.toISOString(),
        incomingPayment.asset.code,
        incomingPayment.asset.scale,
        incomingPayment.incomingAmount
          ? incomingPayment.incomingAmount.toString()
          : null,
        incomingPayment.receivedAmount.toString(),
        incomingPayment.state,
        incomingPayment.walletAddressId,
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error("Error storing incoming payment:", error);
      throw error;
    }
  }

  public async updateWithNewMicroPayment(
    request: UpdateIncomingPaymentWithNewMicroPaymentRequest
  ): Promise<void> {
    const { id, state, receivedAmount, microPayment } = request;
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const updateFields = ["received_amount = $2"];
      const updateValues: (string | bigint)[] = [id, receivedAmount];

      if (state !== undefined && state !== null) {
        updateFields.push("state = $3");
        updateValues.push(state);
      }

      const updateQuery = `UPDATE ${this.TABLE_NAME} 
        SET ${updateFields.join(", ")}
        WHERE id = $1
      `;

      await client.query(updateQuery, updateValues);

      const insertQuery = `INSERT INTO ${this.MICRO_PAYMENT_TABLE_NAME} 
        (id, incoming_payment_id, method, ilp_peer_id, request_id, amount)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;

      const insertValues = [
        crypto.randomUUID(),
        id,
        microPayment.method,
        microPayment.ilpPeerId || null,
        microPayment.requestId,
        microPayment.amount,
      ];

      await client.query(insertQuery, insertValues);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(
        "Error updating incoming payment and inserting micro payment:",
        error
      );
      throw error;
    } finally {
      client.release();
    }
  }

  public async fetchById(id: string): Promise<IncomingPayment | undefined> {
    const res = await this.pool.query<IncomingPaymentRecord>(
      `SELECT id, expires_at, asset_code, asset_scale, incoming_amount, received_amount, state, wallet_address_id FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];

    return {
      id: row.id,
      expiresAt: new Date(row.expires_at),
      asset: {
        code: row.asset_code,
        scale: row.asset_scale,
      },
      incomingAmount: row.incoming_amount
        ? BigInt(row.incoming_amount)
        : undefined,
      receivedAmount: BigInt(row.received_amount),
      state: row.state as LocalIncomingPaymentState,
      walletAddressId: row.wallet_address_id,
      type: "LOCAL",
    };
  }

  public async fetchWithMicroPaymentsById(
    id: string
  ): Promise<IncomingPaymentWithMicroPayments | undefined> {
    throw new Error("not implemented");
  }
}

// ==========================
// Outgoing Payment
// ==========================

export class OutgoingPaymentInMemoryRepository
  implements OutgoingPaymentRepository
{
  private map: Map<string, OutgoingPayment> = new Map();
  private microPaymentMap: Map<string, MicroPayment[]> = new Map();

  public async store(payment: OutgoingPayment): Promise<void> {
    this.map.set(payment.id, payment);
  }

  public async fetchById(id: string): Promise<OutgoingPayment | undefined> {
    return this.map.get(id);
  }

  public async exists(id: string): Promise<boolean> {
    return this.map.has(id);
  }

  public async updateWithNewMicroPayment(request: {
    id: string;
    state: OutgoingPaymentState;
    sentAmount: bigint;
    microPayment: MicroPayment;
  }): Promise<void> {
    const { id, state, sentAmount, microPayment } = request;
    const payment = this.map.get(id);
    if (!payment) {
      throw new Error(`Outgoing payment with id ${id} not found`);
    }

    payment.state = state;
    payment.sentAmount = sentAmount;

    if (!this.microPaymentMap.has(id)) {
      this.microPaymentMap.set(id, []);
    }
    this.microPaymentMap.get(id)!.push(microPayment);
  }
}

interface OutgoingPaymentRecord {
  id: string;
  quote_id: string;
  asset_code: string;
  asset_scale: number;
  state: string;
  sent_amount: string;
  debit_amount: string;
  local_incoming_payment_id: string | null;
  remote_incoming_payment_url: string | null;
  sender_wallet_address_id: string;
}

export class OutgoingPaymentPsqlRepository
  implements OutgoingPaymentRepository
{
  TABLE_NAME = "outgoing_payments";
  MICRO_PAYMENT_TABLE_NAME = "outgoing_micro_payments";
  constructor(private pool: Pool) {}

  public async exists(id: string): Promise<boolean> {
    try {
      const res = await this.pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE id = $1)`,
        [id]
      );
      return res.rows[0].exists;
    } catch (error) {
      console.error("Error checking if wallet address exists:", error);
      throw error;
    }
  }

  public async store(outgoingPayment: OutgoingPayment): Promise<void> {
    try {
      const query = `
        INSERT INTO ${this.TABLE_NAME} (id, quote_id, asset_code, asset_scale, state, sent_amount, debit_amount, local_incoming_payment_id, remote_incoming_payment_url, sender_wallet_address_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      const values = [
        outgoingPayment.id,
        outgoingPayment.quoteId,
        outgoingPayment.asset.code,
        outgoingPayment.asset.scale,
        outgoingPayment.state,
        outgoingPayment.sentAmount.toString(),
        outgoingPayment.debitAmount.toString(),
        outgoingPayment.localIncomingPaymentId,
        outgoingPayment.remoteIncomingPaymentUrl,
        outgoingPayment.senderWalletAddressId,
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error("Error storing outgoing payment:", error);
      throw error;
    }
  }

  public async updateWithNewMicroPayment(
    request: UpdateOutgoingPaymentWithNewMicroPaymentRequest
  ): Promise<void> {
    const { id, state, sentAmount, microPayment } = request;
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Need to form the update dynamically - state may not be defined.
      // This feels like reaching the limit of the native driver and
      // we could probably be use something off-the-shelf for forming sql strings.
      const updateFields: string[] = ["sent_amount = $2"];
      const updateValues: any[] = [id, sentAmount];

      if (state !== undefined && state !== null) {
        updateFields.unshift("state = $3");
        updateValues.push(state);
      }

      const updateQuery = `UPDATE ${this.TABLE_NAME} 
       SET ${updateFields.join(", ")}
       WHERE id = $1
      `;

      await client.query(updateQuery, updateValues);

      const insertQuery = `INSERT INTO ${this.MICRO_PAYMENT_TABLE_NAME} 
       (id, outgoing_payment_id, method, ilp_peer_id, request_id, amount)
       VALUES ($1, $2, $3, $4, $5, $6)
      `;

      const insertValues = [
        crypto.randomUUID(),
        id,
        microPayment.method,
        microPayment.ilpPeerId || null,
        microPayment.requestId,
        microPayment.amount,
      ];

      await client.query(insertQuery, insertValues);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(
        "Error updating outgoing payment and inserting micro-payment:",
        error
      );
      throw error;
    } finally {
      client.release();
    }
  }

  public async fetchById(id: string): Promise<OutgoingPayment | undefined> {
    const res = await this.pool.query<OutgoingPaymentRecord>(
      `SELECT id, quote_id, asset_code, asset_scale, state, sent_amount, debit_amount, local_incoming_payment_id, remote_incoming_payment_url, sender_wallet_address_id FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];

    return {
      id: row.id,
      quoteId: row.quote_id,
      asset: {
        code: row.asset_code,
        scale: row.asset_scale,
      },
      state: row.state as OutgoingPaymentState,
      sentAmount: BigInt(row.sent_amount),
      debitAmount: BigInt(row.debit_amount),
      localIncomingPaymentId: row.local_incoming_payment_id ?? undefined,
      remoteIncomingPaymentUrl: row.remote_incoming_payment_url ?? undefined,
      senderWalletAddressId: row.sender_wallet_address_id,
    };
  }

  public async fetchWithMicroPaymentsById(
    id: string
  ): Promise<OutgoingPaymentWithMicroPayments | undefined> {
    throw new Error("not implemented");
  }
}

// ==========================
// Quote
// ==========================
interface QuoteRecord {
  id: string;
  receive_amount_value: string;
  receive_amount_asset_code: string;
  receive_amount_asset_scale: number;
  debit_amount_value: string;
  debit_amount_asset_code: string;
  debit_amount_asset_scale: number;
  sender_wallet_address_id: string;
  incoming_payment_id: string;
  expires_at: string;
  exchange_rate: string;
}

export class QuotePsqlRepository implements QuoteRepository {
  TABLE_NAME = "quotes";
  constructor(private pool: Pool) {}

  public async exists(id: string): Promise<boolean> {
    try {
      const res = await this.pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE id = $1)`,
        [id]
      );
      return res.rows[0].exists;
    } catch (error) {
      console.error("Error checking if wallet address exists:", error);
      throw error;
    }
  }

  public async store(quote: Quote): Promise<void> {
    try {
      const query = `
        INSERT INTO ${this.TABLE_NAME} (id, receive_amount_value, receive_amount_asset_code, receive_amount_asset_scale, debit_amount_value, debit_amount_asset_code, debit_amount_asset_scale, sender_wallet_address_id, incoming_payment_id, expires_at, exchange_rate)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

      const values = [
        quote.id,
        quote.receiveAmount.value.toString(),
        quote.receiveAmount.assetCode,
        quote.receiveAmount.assetScale,
        quote.debitAmount.value.toString(),
        quote.debitAmount.assetCode,
        quote.debitAmount.assetScale,
        quote.senderWalletAddressId,
        quote.incomingPaymentId,
        quote.expiresAt.toISOString(),
        quote.exchangeRate.toString(),
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error("Error storing quote:", error);
      throw error;
    }
  }

  public async fetchById(id: string): Promise<Quote | undefined> {
    const res = await this.pool.query<QuoteRecord>(
      `SELECT id, receive_amount_value, receive_amount_asset_code, receive_amount_asset_scale, debit_amount_value, debit_amount_asset_code, debit_amount_asset_scale, sender_wallet_address_id, incoming_payment_id, expires_at, exchange_rate FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];

    return {
      id: row.id,
      receiveAmount: {
        value: BigInt(row.receive_amount_value),
        assetCode: row.receive_amount_asset_code,
        assetScale: row.receive_amount_asset_scale,
      },
      debitAmount: {
        value: BigInt(row.debit_amount_value),
        assetCode: row.debit_amount_asset_code,
        assetScale: row.debit_amount_asset_scale,
      },
      senderWalletAddressId: row.sender_wallet_address_id,
      incomingPaymentId: row.incoming_payment_id,
      expiresAt: new Date(row.expires_at),
      // Precision could be lost here if pg precision is higher than js Number
      exchangeRate: Number(row.exchange_rate),
    };
  }

  public async updateAmounts(request: {
    id: string;
    amount: bigint;
  }): Promise<void> {
    const { id, amount } = request;
    try {
      const query = `
        UPDATE ${this.TABLE_NAME}
        SET receive_amount_value = $1, debit_amount_value = $2
        WHERE id = $3
      `;
      const values = [amount.toString(), amount.toString(), id];

      await this.pool.query(query, values);
    } catch (error) {
      console.error("Error storing quote:", error);
      throw error;
    }
  }
}

export class QuoteInMemoryRepository implements QuoteRepository {
  private map: Map<string, Quote> = new Map();

  public async store(quote: Quote): Promise<void> {
    this.map.set(quote.id, quote);
  }

  public async fetchById(id: string): Promise<Quote | undefined> {
    return this.map.get(id);
  }

  public async exists(id: string): Promise<boolean> {
    return this.map.has(id);
  }

  public async updateAmounts(request: {
    id: string;
    amount: bigint;
  }): Promise<void> {
    const { id, amount } = request;
    const quote = this.map.get(id);
    if (!quote) {
      throw new Error(`Quote with id ${id} not found`);
    }

    quote.debitAmount.value = amount;
    quote.receiveAmount.value = amount;
  }
}

// ==========================
// Remote Incoming Payment
// ==========================

export class RemoteIncomingPaymentInMemoryRepository
  implements RemoteIncomingPaymentRepository
{
  private map: Map<string, RemoteIncomingPayment> = new Map();

  public async store(payment: RemoteIncomingPayment): Promise<void> {
    this.map.set(payment.id, payment);
  }

  public async fetchById(
    id: string
  ): Promise<RemoteIncomingPayment | undefined> {
    return this.map.get(id);
  }
}

interface RemoteIncomingPaymentRecord {
  id: string;
  expires_at: string;
  asset_code: string;
  asset_scale: number;
  incoming_amount: string | null;
  received_amount: string;
  ilp_destination_address: string;
  ilp_shared_secret: string;
}
export class RemoteIncomingPaymentPsqlRepository
  implements RemoteIncomingPaymentRepository
{
  TABLE_NAME = "remote_incoming_payments";
  constructor(private pool: Pool) {}

  public async store(
    remoteIncomingPayment: RemoteIncomingPayment
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO ${this.TABLE_NAME} (id, expires_at, asset_code, asset_scale, incoming_amount, received_amount, ilp_destination_address, ilp_shared_secret)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      const values = [
        remoteIncomingPayment.id,
        remoteIncomingPayment.expiresAt.toISOString(),
        remoteIncomingPayment.asset.code,
        remoteIncomingPayment.asset.scale,
        remoteIncomingPayment.incomingAmount
          ? remoteIncomingPayment.incomingAmount.toString()
          : null,
        remoteIncomingPayment.receivedAmount.toString(),
        remoteIncomingPayment.ilpDetails.destinationAddress,
        remoteIncomingPayment.ilpDetails.sharedSecret,
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error("Error storing remote incoming payment:", error);
      throw error;
    }
  }

  public async fetchById(
    id: string
  ): Promise<RemoteIncomingPayment | undefined> {
    const res = await this.pool.query<RemoteIncomingPaymentRecord>(
      `SELECT id, expires_at, asset_code, asset_scale, incoming_amount, received_amount, ilp_destination_address, ilp_shared_secret FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];

    return {
      id: row.id,
      expiresAt: new Date(row.expires_at),
      asset: {
        code: row.asset_code,
        scale: row.asset_scale,
      },
      incomingAmount: row.incoming_amount
        ? BigInt(row.incoming_amount)
        : undefined,
      receivedAmount: BigInt(row.received_amount),
      type: "REMOTE",
      ilpDetails: {
        destinationAddress: row.ilp_destination_address,
        sharedSecret: row.ilp_shared_secret,
      },
    };
  }
}

// ==========================
// Peer
// ==========================
interface IlpPeerRecord {
  id: string;
  asset_code: string;
  asset_scale: number;
  address: string;
  connector_url: string;
  callback_url: string;
}

export class IlpPeerPsqlRepository implements PeerRepository {
  TABLE_NAME = "ilp_peers";
  constructor(private pool: Pool) {}

  public async store(ilpPeer: IlpPeer): Promise<void> {
    try {
      const query = `
        INSERT INTO ${this.TABLE_NAME} (id, asset_code, asset_scale, address, connector_url, callback_url)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      const values = [
        ilpPeer.id,
        ilpPeer.asset.code,
        ilpPeer.asset.scale,
        ilpPeer.address,
        ilpPeer.connectorUrl,
        ilpPeer.callbackUrl,
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error("Error storing ILP Peer:", error);
      throw error;
    }
  }

  public async fetchById(id: string): Promise<IlpPeer | undefined> {
    const res = await this.pool.query<IlpPeerRecord>(
      `SELECT id, asset_code, asset_scale, address, connector_url, callback_url FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];
    return {
      id: row.id,
      asset: {
        code: row.asset_code,
        scale: row.asset_scale,
      },
      address: row.address,
      connectorUrl: row.connector_url,
      callbackUrl: row.callback_url,
    };
  }

  public async getByDestinationAddress(
    address: string
  ): Promise<IlpPeer | undefined> {
    const res = await this.pool.query<IlpPeerRecord>(
      `SELECT id, asset_code, asset_scale, address, connector_url, callback_url FROM ${this.TABLE_NAME} WHERE address = $1`,
      [address]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];
    return {
      id: row.id,
      asset: {
        code: row.asset_code,
        scale: row.asset_scale,
      },
      address: row.address,
      connectorUrl: row.connector_url,
      callbackUrl: row.callback_url,
    };
  }
}

export class IlpPeerInMemoryRepository implements PeerRepository {
  map: Map<string, IlpPeer> = new Map();

  public async store(entity: IlpPeer): Promise<void> {
    this.map.set(entity.id, entity);
  }

  public async fetchById(id: string): Promise<IlpPeer | undefined> {
    return this.map.get(id);
  }

  public async getByDestinationAddress(
    address: string
  ): Promise<IlpPeer | undefined> {
    return [...this.map.values()].find((peer) => peer.address === address);
  }
}
