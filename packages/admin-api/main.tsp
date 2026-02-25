import "@typespec/http";

using Http;

@service(#{ title: "Rafiki Admin API" })
namespace RafikiAdminAPI;



model PaginationParameters {
  @doc("The cursor key to list from.")
  @query cursor?: string; 
  @doc("The number of items to return after the cursor.")
  @query first?: numeric;
  @doc("The number of items to return before the cursor.")
  @query last?: numeric;
}

model PageInfo {
  startCursor?: string;
  endCursor?: string;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}


model PagedResponse<T> {
  pagination: PageInfo;
  result: T[];
}

model Asset {
  @key code: string;
  scale: numeric;
  liquidityLowThreshold?: integer;
  liquidityHighThreshold?: integer;
  initialLiquidity?: integer;
}

model AssetUpdate {
  liquidityLowThreshold?: integer;
  liquidityHighThreshold?: integer;
}

model AmountWithScale {
  amount: numeric;
  @doc("Decimal precision of the amount.")
  scale: string;
}

model LiquidityRequest {
  ...AmountWithScale;
}

@route("/assets")
namespace Assets {
  @doc("Paginate over assets")
  @get
  op list(
    ...PaginationParameters
  ): {
    @statusCode statusCode: 200;
    @body body: PagedResponse<Asset>;
  };

  @post
  op createAsset(@body asset: Asset): {
    @statusCode statusCode: 201;
    @body newAsset: Asset;
  };

  @patch(#{implicitOptionality: false})
  op updateAsset(@path code: string, @body assetUpdate: AssetUpdate): {
    @statusCode statusCode: 204;
  };

  @route("/{code}/liquidity/deposit")
  @post
  op depositLiquidity(
    @path code: string, 
    @body request: LiquidityRequest
  ): {
    @statusCode statusCode: 202;
  };

  @route("/{code}/liquidity/withdraw")
  @post
  op withdrawLiquidity(
    @path code: string, 
    @body request: LiquidityRequest
  ): {
    @statusCode statusCode: 202;
  };
}


model WalletAddressCreate {
  assetCode: string;
  publicName: string;
  isActive?: boolean
}

model WalletAddress {
  @key address: string;
  assetScale: numeric;
  assetCode: string;
  publicName: string;
  isActive?: boolean
}


model WalletAddressUpdate {
  publicName?: string;
  isActive?: boolean
}

model WalletAddressKey {
  @key id: string;
  jwk: string;
}


@route("/wallet-addresses")
namespace WalletAddresses {
  @get
  op getWalletAddress(@path address: string): {
    @statusCode statusCode: 200;
    @body walletAddress: WalletAddress;
  };

  @doc("Paginate over wallet addresses")
  @get
  op list(
      ...PaginationParameters
  ): {
    @statusCode statusCode: 200;
    @body body: PagedResponse<WalletAddress>;
  };

  @post
  op createWalletAddress(@body walletAddressCreate: WalletAddressCreate): {
    @statusCode statusCode: 201;
    @body newWalletAddress: WalletAddress;
  };

  @patch(#{implicitOptionality: false})
  op updateWalletAddress(@path address: string, @body walletAddressUpdate: WalletAddressUpdate): {
    @statusCode statusCode: 204;
  };

  @route("/{address}/keys")
  namespace Keys {
    @get
    op listKeys(@path address: string): {
      @statusCode statusCode: 200;
      @body keys: WalletAddressKey[];
    };

    @post
    op createKey(@path address: string, @body key: WalletAddressKey): {
      @statusCode statusCode: 201;
      @body newKey: WalletAddressKey;
    };
  }
}

enum IncomingPaymentState {
  CREATED,
  EXPIRED,
  COMPLETED,
}

model IncomingPaymentCreate {
  @doc("Client-provided ID. Auto-generated if omitted.")
  id?: string;
  @doc("ID of the wallet address that will receive the payment.")
  walletAddressId: string;
  @doc("Max amount to receive.")
  incomingAmount?: AmountWithScale;
  @doc("Date and time that the incoming payment will expire.")
  expiresAt?: utcDateTime;
  metadata?: Record<unknown>;
}

model IncomingPayment {
  @key id: string;
  walletAddressId: string;
  state: IncomingPaymentState;
  assetCode: string;
  assetScale: numeric;
  incomingAmount?: numeric;
  receivedAmount: numeric;
  expiresAt?: utcDateTime;
  metadata?: Record<unknown>;
}

@route("/incoming-payments")
namespace IncomingPayments {
  @post
  op createIncomingPayment(@body body: IncomingPaymentCreate): {
    @statusCode statusCode: 201;
    @body incomingPayment: IncomingPayment;
  };

  @get
  op getIncomingPayment(@path id: string): {
    @statusCode statusCode: 200;
    @body incomingPayment: IncomingPayment;
  };
}

@doc("Create a quote for a payment. Provide either debitAmount or receiveAmount, but not both. If neither is provided, the incoming payment's incomingAmount is used. If the incoming payment has no incomingAmount and neither is provided, the request will fail with an InvalidQuoteAmountError.")
model QuoteCreate {
  @doc("Client-provided ID. Auto-generated if omitted.")
  id?: string;
  @doc("ID of the wallet address that will send the payment.")
  senderWalletAddressId: string;
  @doc("ID of the incoming payment to quote against.")
  incomingPaymentId: string;
  @doc("Fixed send amount. Mutually exclusive with receiveAmount.")
  debitAmount?: AmountWithScale;
  @doc("Fixed receive amount. Mutually exclusive with debitAmount.")
  receiveAmount?: AmountWithScale;
}

model Quote {
  @key id: string;
  senderWalletAddressId: string;
  incomingPaymentId: string;
  debitAmount: AmountWithScale;
  receiveAmount: AmountWithScale;
  exchangeRate: numeric;
  expiresAt: utcDateTime;
}

@error
model QuoteError {
  @statusCode statusCode: 400;
  @doc("Error type identifier, e.g. InvalidQuoteAmountError.")
  errorType: string;
  message: string;
}

@route("/quotes")
namespace Quotes {
  @post
  op createQuote(@body body: QuoteCreate): {
    @statusCode statusCode: 201;
    @body quote: Quote;
  } | QuoteError;

  @get
  op getQuote(@path id: string): {
    @statusCode statusCode: 200;
    @body quote: Quote;
  };
}

enum OutgoingPaymentState {
  @doc("Created, awaiting ASE approval.")
  PENDING,
  @doc("Approved and liquidity reserved. Payment executing.")
  FUNDED,
  @doc("All funds sent successfully.")
  COMPLETED,
  @doc("Rejected by ASE before funding.")
  REJECTED,
}

@doc("Create an outgoing payment from a quote. Provide quoteId. Or create directly from an incoming payment by providing incomingPaymentId and debitAmount instead.")
model OutgoingPaymentCreate {
  @doc("Client-provided ID. Auto-generated if omitted.")
  id?: string;
  @doc("ID of the wallet address that will send the payment.")
  senderWalletAddressId: string;
  @doc("ID of the quote to execute. Mutually exclusive with incomingPaymentId/debitAmount.")
  quoteId?: string;
  @doc("ID of the incoming payment to pay directly. Requires debitAmount. Mutually exclusive with quoteId.")
  incomingPaymentId?: string;
  @doc("Amount to debit. Required when using incomingPaymentId.")
  debitAmount?: AmountWithScale;
  metadata?: Record<unknown>;
}

model OutgoingPayment {
  @key id: string;
  senderWalletAddressId: string;
  quoteId?: string;
  incomingPaymentId: string;
  state: OutgoingPaymentState;
  assetCode: string;
  assetScale: numeric;
  debitAmount: numeric;
  sentAmount: numeric;
  metadata?: Record<unknown>;
}

model OutgoingPaymentApprove {
}

model OutgoingPaymentReject {
  @doc("Reason for rejecting the payment.")
  reason?: string;
}

@route("/outgoing-payments")
namespace OutgoingPayments {
  @post
  op createOutgoingPayment(@body body: OutgoingPaymentCreate): {
    @statusCode statusCode: 201;
    @body outgoingPayment: OutgoingPayment;
  };

  @get
  op getOutgoingPayment(@path id: string): {
    @statusCode statusCode: 200;
    @body outgoingPayment: OutgoingPayment;
  };

  @route("/{id}/approve")
  @post
  op approveOutgoingPayment(@path id: string, @body body: OutgoingPaymentApprove): {
    @statusCode statusCode: 204;
  };

  @route("/{id}/reject")
  @post
  op rejectOutgoingPayment(@path id: string, @body body: OutgoingPaymentReject): {
    @statusCode statusCode: 204;
  };
}

model IlpPeerSettings {
  ilpAddress: string;
  connectorUrl: string;
  // auth token details?
}

model PeerCreate {
  name: string;
  assetCode: string;
  initialLiquidity?: integer;
  liquidityLowThreshold?: integer;
  liquidityHighThreshold?: integer;
}

model Peer {
  @key id: string;
  name: string;
  assetCode: string;
  initialLiquidity?: integer;
  liquidityLowThreshold?: integer;
  liquidityHighThreshold?: integer;
  address: string;
  liquidity: integer;
}

model PeerUpdate {
  name?: string;
  liquidityLowThreshold?: integer;
  liquidityHighThreshold?: integer;
} 

@route("/peers")
namespace Peers {
  @doc("Paginate over peers")
  @get
  op list(
      ...PaginationParameters
  ): {
    @statusCode statusCode: 200;
    @body body: PagedResponse<Peer>;
  };

  @get
  op getPeer(@path id: string): {
    @statusCode statusCode: 200;
    @body peer: Peer;
  };

  @post
  op createPeer(@body peer: PeerCreate): {
    @statusCode statusCode: 201;
    @body newPeer: Peer;
  };

  @patch(#{implicitOptionality: false})
  op updatePeer(@path id: string, @body peerUpdate: PeerUpdate): {
    @statusCode statusCode: 204;
  };

  @route("/{id}/liquidity/deposit")
  @post
  op depositLiquidity(
    @path id: string, 
    @body request: LiquidityRequest
  ): {
    @statusCode statusCode: 202;
  };

  @route("/{id}/liquidity/withdraw")
  @post
  op withdrawLiquidity(
    @path id: string, 
    @body request: LiquidityRequest
  ): {
    @statusCode statusCode: 202;
  };
}