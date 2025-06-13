"use strict";

import {
    IAssetAccountRepository, ILedgerService,
    IPeerAccountRepository,
    IWalletAddressAccountRepository
} from "./interfaces";
import {LedgerAccount, LedgerAccountType, LedgerTransfer, LiquidityAsset, LiquidityWalletAddress} from "./types";
import {LiquidityRequest, LiquidityRequestType, WalletAddressDepositLiquidityRequest, WalletToWalletAddressLiquidityRequest } from "liquidity-types-lib";
import {
    AccountNotFoundError,
    AssetScaleTooHighError,
    DuplicateAssetAccountFoundError,
    DuplicatePeerAccountFoundError
} from "./errors";
import {Attributes, ILogger, ITelemetryService} from "common-types-lib";


/**
 * ACCOUNT MOVEMENTS
 *
 * When adding liquidity to asset:
 * - settlement => asset
 *
 * When withdrawing liquidity from asset:
 * - asset => settlement
 *
 * When adding liquidity to peer:
 * - settlement => peer
 *
 * When withdrawing liquidity from peer:
 * - peer => settlement
 *
 * When funding a payment:
 * - settlement => wallet address
 *
 * When withdrawing from a payment:
 * - wallet address => settlement
 *
 * When making local payment:
 * - wallet address => wallet address
 * - FX: wallet address => asset liquidity A & asset liquidity B => wallet addres
 *
 * When sending remote (ILP) payments:
 * - wallet address => peer
 * - FX: wallet address => asset liqudity A & asset liquidity B => peer
 *
 * When receiving remote (ILP) payments:
 * - peer => wallet address
 * - FX: peer => asset liquidity A & asset liquidity B => wallet address
 */

const TELEMETRY_API_HISTOGRAM_NAME = "liquidity_domain";

export class LiquidityDomainService {
    LEDGER_SCALE_MAGIC_NUMBER = 20n;

    private readonly _telemetryService: ITelemetryService;
    private readonly _assetAccountRepository: IAssetAccountRepository;
    private readonly _peerAccountRepository: IPeerAccountRepository;
    private readonly _walletAddressAccountRepository: IWalletAddressAccountRepository;
    private readonly _ledgerServiceClient: ILedgerService;
    private readonly _maxBatchSize: number;
    private readonly _logger:ILogger;

    constructor(
        assetAccountRepository: IAssetAccountRepository,
        peerAccountRepository: IPeerAccountRepository,
        walletAddressAccountRepository: IWalletAddressAccountRepository,
        ledgerServiceClient: ILedgerService,
        telemetryService: ITelemetryService,
        maxBatchSize: number,
        logger:ILogger,
    ) {
        this._walletAddressAccountRepository = walletAddressAccountRepository;
        this._peerAccountRepository = peerAccountRepository;
        this._assetAccountRepository = assetAccountRepository;
        this._ledgerServiceClient = ledgerServiceClient;
        this._telemetryService = telemetryService;
        this._maxBatchSize = maxBatchSize;
        this._logger = logger;
    }

    private _startTimer(callname: string): (additionalAttributes?: Attributes) => void {
        return this._telemetryService.startTimer(TELEMETRY_API_HISTOGRAM_NAME, {callName: callname});
    }

    public async execute(requests: LiquidityRequest[]): Promise<void> {
        const transfersToCreate: LedgerTransfer[] = [];

        this._telemetryService.updateGauge("RequestBatchSize", requests.length);

        for (const request of requests) {
            if (request.type === LiquidityRequestType.DEPOSIT_WALLET_ADDRESS) {
                transfersToCreate.push(
                    await this._prepareWalletAddressDepositTransfer(request as  WalletAddressDepositLiquidityRequest)
                );
            }else  if (request.type === LiquidityRequestType.WALLET_ADDRESS_TO_WALLET_ADDRESS) {
                transfersToCreate.push(
                    await this._prepareWalletToWalletAddressTransfer(request as  WalletToWalletAddressLiquidityRequest)
                );
            }else{
                // ignore unknown - should warn
            }
        }

        //
        const batches: LedgerTransfer[][] = [];
        for (let i = 0; i < transfersToCreate.length; i += this._maxBatchSize) {
            const chunk = transfersToCreate.slice(i, i + this._maxBatchSize);
            batches.push(chunk);
        }

        for(const reqBatch of batches) {
            this._logger.debug(`executing batch of ${reqBatch.length} requests...`);

            this._telemetryService.updateGauge("ExecuteBatchSize", reqBatch.length);

            const stopTimer = this._startTimer("ledgerServiceClient.createTransfers");
            await this._ledgerServiceClient.createTransfers(reqBatch);
            stopTimer();

            this._logger.debug(`batch of ${reqBatch.length} requests executed`);
        }
    }

    private async _prepareWalletAddressDepositTransfer(
        request: WalletAddressDepositLiquidityRequest
    ): Promise<LedgerTransfer> {
        const stopTimer = this._startTimer("prepareWalletAddressDepositTransfer");

        //TODO cache and fetch by array
        const [settlementAccount, walletAddressAccount] = await Promise.all([
            this._assetAccountRepository.fetchByCode(request.amount.assetCode),
            this._walletAddressAccountRepository.fetchById(
                request.data.walletAddressId
            ),
        ]);

        if (!settlementAccount || !walletAddressAccount) {
            stopTimer();
            throw new AccountNotFoundError();
        }

        stopTimer();
        return {
            id: request.id,
            debitAccountId: settlementAccount.settlementAccountId,
            creditAccountId: walletAddressAccount.liquidityAccountId,
            assetCode: request.amount.assetCode,
            amount:
                request.amount.value *
                10n **
                (this.LEDGER_SCALE_MAGIC_NUMBER -
                    BigInt(request.amount.assetScale)),
        };
    }

    private async _prepareWalletToWalletAddressTransfer(
        request: WalletToWalletAddressLiquidityRequest
    ): Promise<LedgerTransfer> {
        const stopTimer = this._startTimer("prepareWalletToWalletAddressTransfer");

        //TODO cache and fetch by array
        const [walletAddressToDebit, walletAddressToCredit] = await Promise.all([
            this._walletAddressAccountRepository.fetchById(
                request.data.walletAddressIdToDebit
            ),
            this._walletAddressAccountRepository.fetchById(
                request.data.walletAddressIdToCredit
            ),
        ]);

        if (!walletAddressToDebit || !walletAddressToCredit) {
            stopTimer();
            throw new AccountNotFoundError();
        }

        stopTimer();
        return {
            id: request.id,
            debitAccountId: walletAddressToDebit.liquidityAccountId,
            creditAccountId: walletAddressToCredit.liquidityAccountId,
            assetCode: request.amount.assetCode,
            amount:
                request.amount.value *
                10n **
                (this.LEDGER_SCALE_MAGIC_NUMBER -
                    BigInt(request.amount.assetScale)),
        };
    }

    public async createAssetAccount(asset: LiquidityAsset): Promise<void> {
        if (await this._assetAccountRepository.existsByCode(asset.code)) {
            throw new DuplicateAssetAccountFoundError();
        }

        // This should go into the asset service
        if (asset.scale > this.LEDGER_SCALE_MAGIC_NUMBER) {
            throw new AssetScaleTooHighError();
        }

        const liquidityAccount: LedgerAccount = {
            id: crypto.randomUUID(),
            externalRef: asset.id,
            assetCode: asset.code,
            type: LedgerAccountType.LIQUIDITY_ASSET,
            creditsPosted: 0n,
            debitsPosted: 0n,
        };

        const settlementAccount: LedgerAccount = {
            id: crypto.randomUUID(),
            externalRef: asset.id,
            assetCode: asset.code,
            type: LedgerAccountType.SETTLEMENT,
            creditsPosted: 0n,
            debitsPosted: 0n,
        };

        await this._ledgerServiceClient.createAccounts([
            liquidityAccount,
            settlementAccount,
        ]);

        await this._assetAccountRepository.store({
            id: asset.id,
            assetCode: asset.code,
            assetScale: asset.scale,
            settlementAccountId: settlementAccount.id,
            liquidityAccountId: liquidityAccount.id,
        });
    }

    public async createIlpPeerAccount(peerId: string, peerAssetCode: string, peerAssetScale:number): Promise<void> {
        if (await this._peerAccountRepository.exists(peerId)) {
            throw new DuplicatePeerAccountFoundError();
        }

        const liquidityAccount: LedgerAccount = {
            id: crypto.randomUUID(),
            assetCode: peerAssetCode,
            externalRef: peerId,
            type: LedgerAccountType.LIQUIDITY_PEER,
            creditsPosted: 0n,
            debitsPosted: 0n,
        };

        await this._ledgerServiceClient.createAccounts([liquidityAccount]);

        await this._peerAccountRepository.store({
            id: peerId,
            assetCode: peerAssetCode,
            assetScale: peerAssetScale,
            liquidityAccountId: liquidityAccount.id,
        });
    }

    public async createWalletAddressAccount(walletAddress: LiquidityWalletAddress): Promise<void> {
        if (await this._walletAddressAccountRepository.exists(walletAddress.id)) {
            throw new DuplicatePeerAccountFoundError();
        }

        const liquidityAccount: LedgerAccount = {
            id: crypto.randomUUID(),
            assetCode: walletAddress.assetCode,
            externalRef: walletAddress.id,
            type: LedgerAccountType.LIQUIDITY_WALLET_ADDRESS,
            creditsPosted: 0n,
            debitsPosted: 0n,
        };

        await this._ledgerServiceClient.createAccounts([liquidityAccount]);

        await this._walletAddressAccountRepository.store({
            id: walletAddress.id,
            assetCode: walletAddress.assetCode,
            assetScale: walletAddress.assetScale,
            liquidityAccountId: liquidityAccount.id,
        });
    }
}
