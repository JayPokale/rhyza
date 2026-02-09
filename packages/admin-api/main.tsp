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

model LiquidityRequest {
  @doc("Amount of liqudity to deposit.")
  amount: numeric;
  @doc("Decimal precision of the amount.")
  scale: string;
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