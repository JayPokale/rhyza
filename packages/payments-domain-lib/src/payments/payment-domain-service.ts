"use strict";

import {
    Amount, ApiRspIncomingPaymentEvent, ApiRspQuoteEvent,
    Attributes,
     CreateIncomingPaymentCmd, CreateOutgoingPaymentCmd, CreateQuoteCmd,
     ILocalEventProducerAdapter, ILogger,
    IMessage,
    ITelemetryService, LocalEvent,
    WalletAddress
} from "common-types-lib";
import {IIlpPeerService} from "../ilp-peer";
import {IRatesServiceAdapter} from "../rates";
import {ILiquidityService} from "../liquidity";
import {IRemoteIncomingPaymentService, RemoteIncomingPayment} from "../remote-incoming-payment";
import {IWalletAddressRepository, IWalletAddressService} from "../wallets";
import {IIncomingPaymentRepository, IOutgoingPaymentRepository, IQuoteRepository} from "./payment-ports";

import {
    CreateOutgoingPaymentFromIncomingPaymentRequest,
    CreateOutgoingPaymentFromQuoteRequest,
    CreateQuoteRequest,
    IncomingPayment,
    IncomingPaymentWithNewMicroPaymentUpdate,
    LocalIncomingPaymentState, MicroPayment, OutgoingPayment, OutgoingPaymentState,
    OutgoingPaymentWithNewMicroPaymentUpdate,
    Quote
} from "./payment-types";
import {
    CouldNotConvertExchangeRatesError,
    DuplicateIncomingPaymentFoundError,
    DuplicateOutgoingPaymentFoundError,
    DuplicateQuoteFoundError, IncomingPaymentCannotReceiveMicroPayment,
    IncomingPaymentInvalidStateError,
    IncomingPaymentNotFoundError,
    IncomingPaymentWalletAddressAssetMismatchError,
    InvalidAmountError,
    InvalidIdLengthError,
    InvalidIncomingPaymentExpiryError,
    OutgoingPaymentInvalidStateError,
    OutgoingPaymentMissingIdentifierError, OutgoingPaymentNotFoundError, PeerNotFoundError,
    QuoteExpiredError,
    QuoteNotFoundError,
    WalletAddressInactiveError,
    WalletAddressNotFoundError
} from "../errors";
import {
    IlpPaymentFulfillPacketReceivedEvent,
    IlpPaymentPreparePacketAcceptedEvent,
    IlpPaymentPreparePacketReceivedEvent,
    IlpQuotePacketReceivedEvent, IncomingPaymentCompletedEvent,
    LocalOutgoingPaymentFundedEvent,
    OutgoingPaymentCompletedEvent,
    PaymentEventType,
    RemoteOutgoingPaymentFundedEvent,
    RemoteQuoteRequestedEvent
} from "./payment-events";
import {
    PeerToWalletAddressLiquidityRequest,
    WalletAddressDepositLiquidityRequest, WalletAddressToPeerLiquidityRequest,
    WalletToWalletAddressLiquidityRequest
} from "liquidity-types-lib";

const INCOMING_PAYMENT_MAX_EXPIRY_MS = 2592000000; // 30 days
const INCOMING_PAYMENT_DEFAULT_EXPIRY = 1000 * 60 * 10;
const QUOTE_EXPIRY_MS = 1000 * 60 * 10;

const TELEMETRY_API_HISTOGRAM_NAME = "payments_domain";

export class PaymentDomainService {
    private readonly _logger: ILogger;
    //private readonly _walletAddressService: IWalletAddressService;
    private readonly _walletAddressRepository: IWalletAddressRepository;
    private readonly _ilpPeerService: IIlpPeerService;
    private readonly _ratesService: IRatesServiceAdapter;
    private readonly _liquidityService: ILiquidityService;
    private readonly _remoteIncomingPaymentService: IRemoteIncomingPaymentService;
    private readonly _incomingPaymentRepository: IIncomingPaymentRepository;
    private readonly _outgoingPaymentRepository: IOutgoingPaymentRepository;
    private readonly _quoteRepository: IQuoteRepository;
    private readonly _paymentEventProducer: ILocalEventProducerAdapter;
    private readonly _telemetryService: ITelemetryService;


    constructor(
        // walletAddressService: IWalletAddressService,
        walletAddressRepository: IWalletAddressRepository,
        ilpPeerService: IIlpPeerService,
        ratesService: IRatesServiceAdapter,
        liquidityService: ILiquidityService,
        remoteIncomingPaymentService: IRemoteIncomingPaymentService,
        incomingPaymentRepository: IIncomingPaymentRepository,
        outgoingPaymentRepository: IOutgoingPaymentRepository,
        quoteRepository: IQuoteRepository,
        paymentEventProducer: ILocalEventProducerAdapter,
        telemetryService: ITelemetryService,
        logger: ILogger
    ) {
        this._telemetryService = telemetryService;
        this._paymentEventProducer = paymentEventProducer;
        this._quoteRepository = quoteRepository;
        this._outgoingPaymentRepository = outgoingPaymentRepository;
        this._incomingPaymentRepository = incomingPaymentRepository;
        this._remoteIncomingPaymentService = remoteIncomingPaymentService;
        this._liquidityService = liquidityService;
        this._ratesService = ratesService;
        this._ilpPeerService = ilpPeerService;
        // this._walletAddressService = walletAddressService;
        this._walletAddressRepository = walletAddressRepository;
        this._logger = logger;
    }

    private _startTimer(callname: string): (additionalAttributes?: Attributes) => void {
        return this._telemetryService.startTimer(TELEMETRY_API_HISTOGRAM_NAME, {callName: callname});
    }

    private _outputEvents: IMessage[] = [];
    private _tmpWalletAddress: WalletAddress[] = [];
    private _tmpIncomingPayments: IncomingPayment[] = [];
    private _tmpQuotes: Quote[] = [];
    private _tmpOutgoingPayments: OutgoingPayment[] = [];
    private _tmpIncomingMicroPayments: MicroPayment[] = [];
    private _tmpOutgoingMicroPayments: MicroPayment[] = [];

    async _msgHandlerBatch(cmds: IMessage[]): Promise<IMessage[]> {
        // cleanup before starting
        this._outputEvents = [];
        this._tmpWalletAddress = [];
        this._tmpIncomingPayments = [];
        this._tmpQuotes = [];
        this._tmpOutgoingPayments = [];
        this._tmpIncomingMicroPayments = [];
        this._tmpOutgoingMicroPayments = [];

        // first phase, get everything from repos
        const stopPrefetchPhaseTimer = this._startTimer("PreFetchPhase");
        await this._preFetchPhase(cmds);
        stopPrefetchPhaseTimer();

        // second phase, process all business rules
        for (const cmd of cmds) {
            if (cmd.msgName === CreateIncomingPaymentCmd.name) {
                const id = await this.createIncomingPayment(cmd as CreateIncomingPaymentCmd);
                this._outputEvents.push(
                    new ApiRspIncomingPaymentEvent({createdId: id}, cmd.requestId || "") // TODO remove ""
                );
            } else if (cmd.msgName === CreateQuoteCmd.name) {
                const id = await this.createQuote(cmd as CreateQuoteCmd);
                this._outputEvents.push(
                    new ApiRspQuoteEvent({createdId: id}, cmd.requestId || "") // TODO remove ""
                );
            } else if (cmd.msgName === CreateOutgoingPaymentCmd.name) {
                const id = await this.createOutgoingPayment(cmd as CreateOutgoingPaymentCmd);
                this._outputEvents.push(
                    new ApiRspQuoteEvent({createdId: id}, cmd.requestId || "") // TODO remove ""
                );
            } else {
                this._logger.warn(
                    `${this.constructor.name} - unknown command - msgName: ${cmd.msgName} msgKey: ${cmd.msgKey} msgId: ${cmd.msgId}`
                );
            }
        }

        // third phase, flush everything to repos and return messages

        await this._flush();

        return this._outputEvents;
    }

    private async _preFetchPhase(cmds: IMessage[]){
        // first phase, get everything from repos
        const quoteIdsToFetch:string[] = [];
        const incomingPaymentIdsToFetch:string[] = [];
        const outgoingPaymentIdsToFetch:string[] = [];
        const walletIdsToFetch:string[] = [];

        for (const cmd of cmds) {
            if(cmd.msgName === CreateIncomingPaymentCmd.name){
                const specCmd = cmd as CreateIncomingPaymentCmd;
                if(specCmd.payload.id) {
                    incomingPaymentIdsToFetch.push(specCmd.payload.id);
                }
                walletIdsToFetch.push(specCmd.payload.walletAddressId);
            }else if(cmd.msgName === CreateQuoteCmd.name){
                const specCmd = cmd as CreateQuoteCmd;

                if(specCmd.payload.id) {
                    quoteIdsToFetch.push(specCmd.payload.id);
                }
                incomingPaymentIdsToFetch.push(specCmd.payload.incomingPaymentId);
                walletIdsToFetch.push(specCmd.payload.senderWalletAddressId);
            }else if(cmd.msgName === CreateOutgoingPaymentCmd.name) {
                const specCmd = cmd as CreateOutgoingPaymentCmd;
                if(specCmd.payload.id) {
                    outgoingPaymentIdsToFetch.push(specCmd.payload.id);
                }
                if(specCmd.payload.incomingPaymentId) {
                    incomingPaymentIdsToFetch.push(specCmd.payload.incomingPaymentId);
                }
                if(specCmd.payload.quoteId) {
                    quoteIdsToFetch.push(specCmd.payload.quoteId);
                }

                walletIdsToFetch.push(specCmd.payload.senderWalletAddressId);

            }else{
                this._logger.warn(
                    `${this.constructor.name} - unknown command - msgName: ${cmd.msgName} msgKey: ${cmd.msgKey} msgId: ${cmd.msgId}`
                );
            }
        }

        const promises:Promise<void>[] = [];

        const walletFetches = new Promise<void>(async (resolve, reject) => {
            this._tmpWalletAddress = await this._walletAddressRepository.fetchByIds(walletIdsToFetch)
        });
        promises.push(walletFetches);

        const incomingFetches = new Promise<void>(async (resolve, reject) => {
            this._tmpIncomingPayments = await this._incomingPaymentRepository.fetchByIds(incomingPaymentIdsToFetch)
        });
        promises.push(incomingFetches);

        const quoteFetches = new Promise<void>(async (resolve, reject) => {
            this._tmpQuotes = await this._quoteRepository.fetchByIds(quoteIdsToFetch)
        });
        promises.push(quoteFetches);

        const outgoingFetches = new Promise<void>(async (resolve, reject) => {
            this._tmpQuotes = await this._outgoingPaymentRepository.fetchByIds(outgoingFetches)
        });
        promises.push(outgoingFetches);

        await Promise.all(promises);
    };




    private _getWallet(id:string): WalletAddress | null{
        const found = this._tmpWalletAddress.find(item => (item.id === id));
        return found || null;
    }


    public async createIncomingPayment(cmd: CreateIncomingPaymentCmd): Promise<string> {
        const stopTimer = this._startTimer("CreateIncomingPaymentCmd");

        let id: string;
        if (cmd.payload.id) {
            if (cmd.payload.id.length > 64) {
                throw new InvalidIdLengthError(
                    "Incoming Payment ID is too long (max 64 characters)"
                );
            }

            const stopTimerRepo = this._startTimer("CreateIncomingPaymentCmd.repoExists");
            const exists = await this._incomingPaymentRepository.exists(cmd.payload.id);
            stopTimerRepo();

            if (exists) {
                throw new DuplicateIncomingPaymentFoundError();
            }
            id = cmd.payload.id;
        } else {
            id = crypto.randomUUID();
        }

        const walletAddress = this._getWallet(cmd.payload.walletAddressId);

        if (!walletAddress) {
            stopTimer();
            throw new WalletAddressNotFoundError();
        }

        if (!walletAddress.isActive) {
            stopTimer();
            throw new WalletAddressInactiveError();
        }

        if (
            cmd.payload.incomingAmount &&
            (walletAddress.assetCode !== cmd.payload.incomingAmount.assetCode ||
                walletAddress.assetScale !== cmd.payload.incomingAmount.assetScale)
        ) {
            stopTimer();
            throw new IncomingPaymentWalletAddressAssetMismatchError();
        }

        let incomingAmount: Amount | undefined = undefined;
        if (cmd.payload.incomingAmount) {
            incomingAmount = {
                assetCode: cmd.payload.incomingAmount.assetCode,
                assetScale: cmd.payload.incomingAmount.assetScale,
                value: BigInt(cmd.payload.incomingAmount.value),
            }
        }

        if (
            cmd.payload.expiresAt &&
            (cmd.payload.expiresAt.getTime() <= Date.now() ||
                cmd.payload.expiresAt.getTime() >
                Date.now() + INCOMING_PAYMENT_MAX_EXPIRY_MS)
        ) {
            stopTimer();
            throw new InvalidIncomingPaymentExpiryError();
        }

        const expiresAt =
            cmd.payload.expiresAt ??
            new Date(Date.now() + INCOMING_PAYMENT_DEFAULT_EXPIRY);

        const newIncomingPayment: IncomingPayment = {
            id,
            incomingAmount: incomingAmount?.value || undefined,
            receivedAmount: 0n,
            expiresAt,
            walletAddressId: walletAddress.id,
            type: "LOCAL",
            state: LocalIncomingPaymentState.CREATED,
            asset: {
                code: walletAddress.assetCode,
                scale: walletAddress.assetScale,
            },
        };

        const stopTimerStore = this._startTimer("CreateIncomingPaymentCmd.StoreIncomingPayment");
        await this._incomingPaymentRepository.store(newIncomingPayment);
        stopTimerStore()

        await this._paymentEventProducer.publish([{
            type: PaymentEventType.INCOMING_PAYMENT_CREATED,
            data: {
                incomingPayment: newIncomingPayment,
            },
        }]);

        stopTimer();
        return id;
    }

    private async fetchIncomingPayment(
        incomingPaymentId: string
    ): Promise<IncomingPayment | RemoteIncomingPayment | undefined> {
        const stopTimer = this._startTimer("fetchIncomingPayment");
        const localIncomingPayment = this._incomingPaymentRepository.fetchById(incomingPaymentId);
        if (localIncomingPayment) {
            stopTimer();
            return localIncomingPayment;
        }

        const remoteIncomingPayment = await this._remoteIncomingPaymentService.getById(incomingPaymentId);

        stopTimer();
        return remoteIncomingPayment;
    }

    public async createQuote(cmd: CreateQuoteCmd): Promise<string> {
        const stopTimer = this._startTimer("CreateQuoteCmd");

        let id: string;
        if (cmd.payload.id) {
            if (cmd.payload.id.length > 64) {
                throw new InvalidIdLengthError(
                    "Quote ID is too long (max 64 characters)"
                );
            }
            const stopTimerRepo = this._startTimer("CreateQuoteCmd.repoExists");
            const exists = await this._quoteRepository.exists(cmd.payload.id);
            stopTimerRepo();

            if (exists) {
                throw new DuplicateQuoteFoundError();
            }

            id = cmd.payload.id;
        } else {
            id = crypto.randomUUID();
        }

        const walletAddress = this._getWallet(cmd.payload.senderWalletAddressId);

        const [incomingPayment] = await Promise.all([
            this.fetchIncomingPayment(cmd.payload.incomingPaymentId),
        ]);

        if (!walletAddress) {
            stopTimer();
            throw new WalletAddressNotFoundError();
        }

        if (!walletAddress.isActive) {
            stopTimer();
            throw new WalletAddressInactiveError();
        }

        if (!incomingPayment) {
            stopTimer();
            throw new IncomingPaymentNotFoundError();
        }

        let createdId: string;

        const request: CreateQuoteRequest = {
            id: cmd.payload.id,
            debitAmount: cmd.payload.debitAmount
                ? {
                    assetCode: cmd.payload.debitAmount.assetCode,
                    assetScale: cmd.payload.debitAmount.assetScale,
                    value: BigInt(cmd.payload.debitAmount.value),
                }
                : undefined,
            receiveAmount: cmd.payload.receiveAmount
                ? {
                    assetCode: cmd.payload.receiveAmount.assetCode,
                    assetScale: cmd.payload.receiveAmount.assetScale,
                    value: BigInt(cmd.payload.receiveAmount.value),
                }
                : undefined,
            senderWalletAddressId: cmd.payload.senderWalletAddressId,
            incomingPaymentId: cmd.payload.incomingPaymentId,
        };


        if (incomingPayment.type === "LOCAL") {
            createdId = await this.createLocalQuote(request, id, incomingPayment, walletAddress);
        } else {
            createdId = await this.createRemoteQuote(request, id, incomingPayment, walletAddress);
        }

        stopTimer();
        return createdId;
    }

    public async createLocalQuote(
        request: CreateQuoteRequest,
        id: string,
        incomingPayment: IncomingPayment,
        walletAddress: WalletAddress
    ): Promise<string> {
        const stopTimer = this._startTimer("createLocalQuote");

        if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
            stopTimer();
            throw new IncomingPaymentInvalidStateError();
        }

        // We are assuming we don't care about how much has already been paid into
        // an incoming payment. Let the quote happen.

        let quoteReceiveAmount: Amount;
        let quoteDebitAmount: Amount;
        let exchangeRate: number;

        if (request.debitAmount) {
            const result = await this.calculateReceiveAmountFromDebitAmount({
                debitAmount: request.debitAmount,
                walletAddress,
                incomingPayment,
            });

            quoteReceiveAmount = result.receiveAmount;
            exchangeRate = result.exchangeRate;
            quoteDebitAmount = request.debitAmount;
        } else if (request.receiveAmount) {
            const result = await this.calculateDebitAmountFromReceiveAmount({
                receiveAmount: request.receiveAmount,
                walletAddress,
                incomingPayment,
            });

            quoteDebitAmount = result.debitAmount;
            exchangeRate = result.exchangeRate;
            quoteReceiveAmount = request.receiveAmount;
        } else if (incomingPayment.incomingAmount) {
            const result = await this.calculateDebitAmountFromIncomingPaymentAmount({
                walletAddress,
                incomingPayment: {
                    ...incomingPayment,
                    incomingAmount: incomingPayment.incomingAmount,
                },
            });

            quoteDebitAmount = result.debitAmount;
            exchangeRate = result.exchangeRate;
            quoteReceiveAmount = {
                assetCode: incomingPayment.asset.code,
                assetScale: incomingPayment.asset.scale,
                value: incomingPayment.incomingAmount,
            };
        } else {
            stopTimer();
            throw new InvalidAmountError();
        }

        const quoteDefaultExpiryMs = new Date().getTime() + QUOTE_EXPIRY_MS;

        const newQuote: Quote = {
            id,
            receiveAmount: quoteReceiveAmount,
            debitAmount: quoteDebitAmount,
            senderWalletAddressId: walletAddress.id,
            incomingPaymentId: incomingPayment.id,
            exchangeRate,
            expiresAt: new Date(
                Math.min(incomingPayment.expiresAt.getTime(), quoteDefaultExpiryMs)
            ),
        };


        const stopRepoTimer = this._startTimer("storeLocalQuote");
        await this._quoteRepository.store(newQuote);
        stopRepoTimer();

        stopTimer();
        return id;
    }

    public async createRemoteQuote(
        request: CreateQuoteRequest,
        id: string,
        incomingPayment: RemoteIncomingPayment,
        walletAddress: WalletAddress
    ): Promise<string> {
        // TODO: Do we need to check remote incoming payment here?

        const stopTimer = this._startTimer("createRemoteQuote");

        const quoteDefaultExpiryMs = new Date().getTime() + QUOTE_EXPIRY_MS;

        // TODO: handle debit & receive amount
        const newQuote: Quote = {
            id,
            receiveAmount: request.debitAmount!,
            debitAmount: request.debitAmount!,
            senderWalletAddressId: walletAddress.id,
            incomingPaymentId: incomingPayment.id,
            exchangeRate: 1,
            expiresAt: new Date(quoteDefaultExpiryMs),
        };

        const stopRepoTimer = this._startTimer("storeRemoteQuote");
        await this._quoteRepository.store(newQuote);
        stopRepoTimer();

        const event: RemoteQuoteRequestedEvent = {
            type: PaymentEventType.REMOTE_QUOTE_REQUESTED,
            data: {
                quote: {
                    id,
                    debitAmount: request.debitAmount!,
                    senderWalletAddressId: walletAddress.id,
                },
                incomingPayment,
            },
        };

        await this._paymentEventProducer.publish([event]);

        stopTimer();
        return id;
    }

    private async calculateReceiveAmountFromDebitAmount({
        debitAmount,
        walletAddress,
        incomingPayment,
    }: {
debitAmount: Amount;
incomingPayment: IncomingPayment;
walletAddress: WalletAddress;
}): Promise<{
        exchangeRate: number;
        receiveAmount: Amount;
    }> {
        if (
            debitAmount.assetCode !== walletAddress.assetCode ||
            debitAmount.assetScale !== walletAddress.assetScale ||
            debitAmount.value <= 0n
        ) {
            throw new InvalidAmountError();
        }

        const isSameAssetQuote =
            debitAmount.assetCode === incomingPayment.asset.code;

        if (isSameAssetQuote) {
            const exchangeRate =
                10 ** (incomingPayment.asset.scale - debitAmount.assetScale);
            const receiveAmountValue = BigInt(
                Math.floor(Number(debitAmount.value) * exchangeRate)
            );

            return {
                receiveAmount: {
                    assetCode: incomingPayment.asset.code,
                    assetScale: incomingPayment.asset.scale,
                    value: receiveAmountValue,
                },
                exchangeRate,
            };
        }

        const conversionResponse = await this._ratesService.convertFromSource({
            destinationAsset: incomingPayment.asset,
            sourceAmount: debitAmount.value,
            sourceAsset: {
                code: debitAmount.assetCode,
                scale: debitAmount.assetScale,
            },
        });

        if (!conversionResponse) {
            throw new CouldNotConvertExchangeRatesError();
        }

        return {
            receiveAmount: {
                assetCode: incomingPayment.asset.code,
                assetScale: incomingPayment.asset.scale,
                value: conversionResponse.destinationAmount,
            },
            exchangeRate: conversionResponse.exchangeRate,
        };
    }

    private async calculateDebitAmountFromReceiveAmount({
        receiveAmount,
        walletAddress,
        incomingPayment,
    }: {
        receiveAmount: Amount;
        incomingPayment: IncomingPayment;
        walletAddress: WalletAddress;
    }): Promise<{
        exchangeRate: number;
        debitAmount: Amount;
    }> {
        if (
            receiveAmount.assetCode !== incomingPayment.asset.code ||
            receiveAmount.assetScale !== incomingPayment.asset.scale ||
            receiveAmount.value <= 0n
        ) {
            throw new InvalidAmountError();
        }

        const isSameAssetQuote =
            receiveAmount.assetCode === walletAddress.assetCode;
        if (isSameAssetQuote) {
            // TODO: additional logic for making sure we can actually deliver the minimum amount of the receiving asset scale (e.g. sending from scale 4 to 2, may not satisfy a single unit of 2)
            const exchangeRate =
                10 ** (walletAddress.assetScale - receiveAmount.assetScale);
            const debitAmountValue = BigInt(
                Math.ceil(Number(receiveAmount.value) * exchangeRate)
            );

            return {
                debitAmount: {
                    assetCode: walletAddress.assetCode,
                    assetScale: walletAddress.assetScale,
                    value: debitAmountValue,
                },
                exchangeRate,
            };
        }

        const conversionResponse = await this._ratesService.convertFromDestination({
            destinationAsset: incomingPayment.asset,
            destinationAmount: receiveAmount.value,
            sourceAsset: {
                code: walletAddress.assetCode,
                scale: walletAddress.assetScale,
            },
        });

        if (!conversionResponse) {
            throw new CouldNotConvertExchangeRatesError();
        }

        return {
            debitAmount: {
                assetCode: walletAddress.assetCode,
                assetScale: walletAddress.assetScale,
                value: conversionResponse.sourceAmount,
            },
            exchangeRate: conversionResponse.exchangeRate,
        };
    }

    private async calculateDebitAmountFromIncomingPaymentAmount({
        walletAddress,
        incomingPayment,
    }: {
        incomingPayment: IncomingPayment & {
            incomingAmount: Pick<IncomingPayment, "incomingAmount">;
        };
        walletAddress: WalletAddress;
    }): Promise<{
        exchangeRate: number;
        debitAmount: Amount;
    }> {
        if (
            walletAddress.assetCode !== incomingPayment.asset.code ||
            walletAddress.assetScale !== incomingPayment.asset.scale
        ) {
            throw new InvalidAmountError();
        }

        if (incomingPayment.asset.code === walletAddress.assetCode) {
            // TODO: additional logic for making sure we can actually deliver the minimum amount of the receiving asset scale (e.g. sending from scale 4 to 2 may not satisfy a single unit of 2)
            const exchangeRate = 10 ** (walletAddress.assetScale - incomingPayment.asset.scale);
            const debitAmountValue = BigInt(Math.ceil(Number(incomingPayment.incomingAmount) * exchangeRate));

            return {
                debitAmount: {
                    assetCode: walletAddress.assetCode,
                    assetScale: walletAddress.assetScale,
                    value: debitAmountValue,
                },
                exchangeRate,
            };
        }

        const conversionResponse = await this._ratesService.convertFromDestination({
            destinationAsset: incomingPayment.asset,
            destinationAmount: incomingPayment.incomingAmount,
            sourceAsset: {
                code: walletAddress.assetCode,
                scale: walletAddress.assetScale,
            },
        });

        if (!conversionResponse) {
            throw new CouldNotConvertExchangeRatesError();
        }

        return {
            debitAmount: {
                assetCode: walletAddress.assetCode,
                assetScale: walletAddress.assetScale,
                value: conversionResponse.sourceAmount,
            },
            exchangeRate: conversionResponse.exchangeRate,
        };
    }

    public async createOutgoingPayment(cmd: CreateOutgoingPaymentCmd) {
        const stopTimer = this._startTimer("CreateOutgoingPaymentCmd");
        const request = {
            senderWalletAddressId: cmd.payload.senderWalletAddressId,
        } as CreateOutgoingPaymentFromQuoteRequest &
            CreateOutgoingPaymentFromIncomingPaymentRequest;

        if (cmd.payload.id) {
            request.id = cmd.payload.id;
        }
        if (cmd.payload.incomingPaymentId) {
            request.incomingPaymentId = cmd.payload.incomingPaymentId;
        }
        if (cmd.payload.quoteId) {
            request.quoteId = cmd.payload.quoteId;
        }
        if (cmd.payload.debitAmount) {
            request.debitAmount = {
                ...cmd.payload.debitAmount,
                value: BigInt(cmd.payload.debitAmount.value),
            };
        }

        let createdId:string;
        if ("quoteId" in request) {
            createdId = await this.createOutgoingPaymentFromQuote(
                request as CreateOutgoingPaymentFromQuoteRequest
            );
        } else if ("incomingPaymentId" in request) {
            createdId = await this.createOutgoingPaymentFromIncomingPayment(
                request as CreateOutgoingPaymentFromIncomingPaymentRequest
            );
        } else {
            stopTimer();
            throw new OutgoingPaymentMissingIdentifierError();
        }

        stopTimer();
        return createdId;
    }

    private async createOutgoingPaymentFromQuote(
        request: CreateOutgoingPaymentFromQuoteRequest
    ) {
        const stopTimer = this._startTimer("CreateOutgoingPaymentFromQuote");

        let outgoingPaymentId;

        if (request.id) {
            if (request.id.length > 64) {
                throw new InvalidIdLengthError(
                    "Outgoing Payment ID is too long (max 64 characters)"
                );
            }

            const stopTimerRepo = this._startTimer("CreateOutgoingPaymentFromQuote.repoExists");
            const exists = await this._outgoingPaymentRepository.exists(request.id);
            stopTimerRepo();

            if (exists) {
                stopTimer();
                throw new DuplicateOutgoingPaymentFoundError();
            }
            outgoingPaymentId = request.id;
        } else {
            outgoingPaymentId = crypto.randomUUID();
        }

        const stopTimerRepos = this._startTimer("CreateOutgoingPaymentFromQuote.getWalletAndQuote");

        const walletAddress = this._getWallet(request.senderWalletAddressId);

        const [ quote] = await Promise.all([
            this._quoteRepository.fetchById(request.quoteId),
        ]);
        stopTimerRepos();

        if (!walletAddress) {
            stopTimer();
            throw new WalletAddressNotFoundError();
        }

        if (!walletAddress.isActive) {
            stopTimer();
            throw new WalletAddressInactiveError();
        }

        if (!quote) {
            stopTimer();
            throw new QuoteNotFoundError();
        }

        // TODO: Check quote hasn't been used already

        if (quote.expiresAt <= new Date()) {
            stopTimer();
            throw new QuoteExpiredError();
        }

        const stopTimerRepo2 = this._startTimer("CreateOutgoingPaymentFromQuote.fetchIncomingPayment");
        const incomingPayment = await this.fetchIncomingPayment(
            quote.incomingPaymentId
        );
        stopTimerRepo2();

        if (!incomingPayment) {
            stopTimer();
            throw new IncomingPaymentNotFoundError();
        }

        if (incomingPayment.type === "LOCAL") {
            if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
                stopTimer();
                throw new IncomingPaymentInvalidStateError();
            }

            // create both liquidity requests
            const depositWalletAddressLiqReq = new WalletAddressDepositLiquidityRequest(
                crypto.randomUUID(),
                quote.senderWalletAddressId,
                quote.debitAmount
            );

            // TODO: FX handling, if receiving wallet asset is different than sending wallet
            const walletToWalletLiqReq = new WalletToWalletAddressLiquidityRequest(
                crypto.randomUUID(),
                quote.senderWalletAddressId,
                incomingPayment.walletAddressId,
                quote.debitAmount,
            );

            const stopTimerLiqSvc = this._startTimer("CreateOutgoingPaymentFromQuote.liq.reqs");
            await this._liquidityService.execute([depositWalletAddressLiqReq, walletToWalletLiqReq]);
            stopTimerLiqSvc();

            // completed outgoing payment
            const outgoingPayment: OutgoingPayment = {
                id: outgoingPaymentId,
                quoteId: quote.id,
                senderWalletAddressId: walletAddress.id,
                asset: {
                    code: walletAddress.assetCode,
                    scale: walletAddress.assetScale,
                },
                debitAmount: quote.debitAmount.value,
                sentAmount: quote.debitAmount.value, //
                localIncomingPaymentId: incomingPayment.id,
                state: OutgoingPaymentState.COMPLETED, // TODO: check if the outgoing payment request came from third party, and webhook out to ASE instead of marking as FUNDED directly
            };

            const outgoingMicroPayment:MicroPayment = {
                requestId: outgoingPayment.id,
                amount: outgoingPayment.debitAmount,
                method: "LOCAL",
            }

            const incomingMicroPayment:MicroPayment = {
                requestId: outgoingPayment.id,
                amount: quote.receiveAmount.value, // TODO: need to send _up to_ to incomingAmount, as the quoted amount might be more
                method: "LOCAL",
            }

            const repoPromises: Promise<void>[] = [];

            repoPromises.push(this._outgoingPaymentRepository.store(outgoingPayment));


            if (incomingPayment.incomingAmount && incomingPayment.receivedAmount >= incomingPayment.incomingAmount) {
                incomingPayment.state = LocalIncomingPaymentState.COMPLETED;

                repoPromises.push(this._incomingPaymentRepository.store(incomingPayment));
            }

            /*
            * NOTE nothing consumes the INCOMING_PAYMENT_COMPLETED or
            * OUTGOING_PAYMENT_COMPLETED - removed those blocks
            */

            repoPromises.push(
                this._outgoingPaymentRepository.storeNewMicroPayment(
                    outgoingPayment.id,
                    outgoingMicroPayment
                ),
                this._incomingPaymentRepository.storeNewMicroPayment(
                    incomingPayment.id,
                    incomingMicroPayment
                )
            );

            const stopTimer2 = this._startTimer("CreateOutgoingPaymentFromQuote.repoPromisesAll");
            await Promise.all(repoPromises);
            stopTimer2();

            // await this._paymentEventProducer.publish(events);
            this._telemetryService.incrementCounter("outgoing_payments_completed", 1);

            stopTimer();
            return outgoingPayment.id;
        }

        /*
        * REMOTE branch
        * */

        const walletAddressFundRequest = new WalletAddressDepositLiquidityRequest(
            crypto.randomUUID(),
            request.senderWalletAddressId,
            quote.debitAmount,
        );

        const stopTimerLiqSvc = this._startTimer("CreateOutgoingPaymentFromQuote.liq.walletAddressFund");
        await this._liquidityService.execute([walletAddressFundRequest]);
        stopTimerLiqSvc();

        const outgoingPayment: OutgoingPayment = {
            id: crypto.randomUUID(),
            quoteId: quote.id,
            senderWalletAddressId: walletAddress.id,
            asset: {
                code: walletAddress.assetCode,
                scale: walletAddress.assetScale,
            },
            debitAmount: quote.debitAmount.value,
            sentAmount: 0n,
            remoteIncomingPaymentUrl: incomingPayment.id,
            state: "FUNDED",
        };

        const stopTimerRepoStore = this._startTimer("CreateOutgoingPaymentFromQuote.outgoingPaymentRepository.store");
        await this._outgoingPaymentRepository.store(outgoingPayment);
        stopTimerRepoStore();


        /*
        * NOTE nothing consumes the REMOTE_OUTGOING_PAYMENT_FUNDED - removed this block
        */

        /*const remoteOutgoingPaymentFundedEvent: RemoteOutgoingPaymentFundedEvent = {
            type: PaymentEventType.REMOTE_OUTGOING_PAYMENT_FUNDED,
            data: {
                outgoingPaymentId: outgoingPayment.id,
                debitAmount: quote.debitAmount,
                receiveAmount: quote.receiveAmount,
                remoteIncomingPaymentUrl: outgoingPayment.remoteIncomingPaymentUrl!,
                quoteExpiresAt: quote.expiresAt,
                ilpDetails: incomingPayment.ilpDetails,
            },
        };

        // TODO: Do we need to place a hold amount for a wallet address => peer transfer? Even though we fully funded the payment already?

        await this._paymentEventProducer.publish([remoteOutgoingPaymentFundedEvent]);
        */

        stopTimer();
        return outgoingPayment.id;
    }

    private async createOutgoingPaymentFromIncomingPayment(
        request: CreateOutgoingPaymentFromIncomingPaymentRequest
    ) {
        let outgoingPaymentId;

        if (request.id) {
            if (request.id.length > 64) {
                throw new InvalidIdLengthError(
                    "Outgoing Payment ID is too long (max 64 characters)"
                );
            }

            const exists = await this._outgoingPaymentRepository.exists(request.id);

            if (exists) {
                throw new DuplicateOutgoingPaymentFoundError();
            }
            outgoingPaymentId = request.id;
        } else {
            outgoingPaymentId = crypto.randomUUID();
        }

        const walletAddress = this._getWallet(request.senderWalletAddressId);

        const [incomingPayment] = await Promise.all([
            this.fetchIncomingPayment(request.incomingPaymentId),
        ]);

        if (!walletAddress) {
            throw new WalletAddressNotFoundError();
        }

        if (!walletAddress.isActive) {
            throw new WalletAddressInactiveError();
        }

        if (!incomingPayment) {
            throw new IncomingPaymentNotFoundError();
        }

        if (incomingPayment.type === "LOCAL") {
            if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
                throw new IncomingPaymentInvalidStateError();
            }

            let debitAmount: Amount;
            let receiveAmount: Amount;

            if (
                request.debitAmount.assetCode !== walletAddress.assetCode ||
                request.debitAmount.assetScale !== walletAddress.assetScale ||
                request.debitAmount.value <= 0n
            ) {
                throw new InvalidAmountError();
            }

            debitAmount = request.debitAmount;

            const result = await this.calculateReceiveAmountFromDebitAmount({
                debitAmount,
                walletAddress,
                incomingPayment,
            });

            receiveAmount = result.receiveAmount;

            if (
                typeof incomingPayment.incomingAmount === "bigint" &&
                receiveAmount.value < incomingPayment.incomingAmount
            ) {
                throw new InvalidAmountError();
            }

            const walletAddressFundRequest = new WalletAddressDepositLiquidityRequest(
                crypto.randomUUID(),
                walletAddress.id, debitAmount
            );

            const stopTimerLiqSvc = this._telemetryService.startTimer(
                "command_handler_msg_handler_ms",
                {
                    callName: `PaymentService.createOutgoingPaymentFromQuote.liq`,
                    description: "TODO",
                }
            );
            await this._liquidityService.execute([walletAddressFundRequest]);
            stopTimerLiqSvc();

            const outgoingPayment: OutgoingPayment = {
                id: outgoingPaymentId,
                senderWalletAddressId: walletAddress.id,
                asset: {
                    code: walletAddress.assetCode,
                    scale: walletAddress.assetScale,
                },
                debitAmount: debitAmount.value,
                sentAmount: 0n,
                localIncomingPaymentId: incomingPayment.id,
                state: OutgoingPaymentState.FUNDED,
            };

            const localOutgoingPaymentFundedEvent: LocalOutgoingPaymentFundedEvent = {
                type: PaymentEventType.LOCAL_OUTGOING_PAYMENT_FUNDED,
                data: {
                    outgoingPayment,
                    incomingPayment,
                    senderWalletAddressId: walletAddress.id,
                    receiveAmount,
                    debitAmount,
                },
            };

            await this._outgoingPaymentRepository.store(outgoingPayment);
            await this._paymentEventProducer.publish([
                localOutgoingPaymentFundedEvent,
            ]);

            return outgoingPayment.id;
        } else {
            const walletAddressFundRequest = new WalletAddressDepositLiquidityRequest(
                crypto.randomUUID(),
                request.senderWalletAddressId,
                request.debitAmount
            );

            const stopTimerLiqSvc = this._telemetryService.startTimer(
                "command_handler_msg_handler_ms",
                {
                    callName: `PaymentService.createOutgoingPaymentFromQuote.liq`,
                    description: "TODO",
                }
            );
            await this._liquidityService.execute([walletAddressFundRequest]);
            stopTimerLiqSvc();

            const outgoingPayment: OutgoingPayment = {
                id: crypto.randomUUID(),
                senderWalletAddressId: walletAddress.id,
                asset: {
                    code: walletAddress.assetCode,
                    scale: walletAddress.assetScale,
                },
                debitAmount: request.debitAmount.value,
                sentAmount: 0n,
                remoteIncomingPaymentUrl: incomingPayment.id,
                state: OutgoingPaymentState.FUNDED,
            };
            await this._outgoingPaymentRepository.store(outgoingPayment);

            const remoteOutgoingPaymentFundedEvent: RemoteOutgoingPaymentFundedEvent =
                {
                    type: PaymentEventType.REMOTE_OUTGOING_PAYMENT_FUNDED,
                    data: {
                        outgoingPaymentId: outgoingPayment.id,
                        debitAmount: request.debitAmount,
                        remoteIncomingPaymentUrl: outgoingPayment.remoteIncomingPaymentUrl!,
                        ilpDetails: incomingPayment.ilpDetails,
                    },
                };

            await this._paymentEventProducer.publish([
                remoteOutgoingPaymentFundedEvent,
            ]);
            return outgoingPayment.id;
        }
    }

    private addMicroPaymentToIncomingPayment(
        incomingPayment: IncomingPayment,
        microPayment: MicroPayment
    ): IncomingPaymentWithNewMicroPaymentUpdate {
        if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
            throw new IncomingPaymentCannotReceiveMicroPayment();
        }

        incomingPayment.receivedAmount += microPayment.amount; // received amount can be larger than incoming amount because of FX

        const update: IncomingPaymentWithNewMicroPaymentUpdate = {
            microPayment,
            receivedAmount: incomingPayment.receivedAmount,
        };

        if (
            incomingPayment.incomingAmount &&
            incomingPayment.receivedAmount >= incomingPayment.incomingAmount
        ) {
            incomingPayment.state = LocalIncomingPaymentState.COMPLETED;
            update.state = incomingPayment.state;
        }

        return update;
    }

    private addMicroPaymentToOutgoingPayment(
        outgoingPayment: OutgoingPayment,
        microPayment: MicroPayment
    ): OutgoingPaymentWithNewMicroPaymentUpdate {
        if (outgoingPayment.state !== OutgoingPaymentState.FUNDED) {
            throw new OutgoingPaymentInvalidStateError();
        }

        outgoingPayment.sentAmount += microPayment.amount;

        const update: OutgoingPaymentWithNewMicroPaymentUpdate = {
            microPayment,
            sentAmount: microPayment.amount,
        };

        // TODO: determine whether this can/should happen
        if (outgoingPayment.sentAmount > outgoingPayment.debitAmount) {
            throw new OutgoingPaymentInvalidStateError();
        }

        if (outgoingPayment.sentAmount === outgoingPayment.debitAmount) {
            outgoingPayment.state = OutgoingPaymentState.COMPLETED;
            update.state = outgoingPayment.state;
        }

        return update;
    }

    // We can decide whether we want to keep this event or not, or just complete the outgoing payment synchronously in the payment handler,
    // in order to save one call to the liquidity service (we can fund the wallet address and make the wallet to wallet transfer directly in a single request)
    public async handleLocalOutgoingPaymentFundedEvent(
        event: LocalOutgoingPaymentFundedEvent
    ) {
        const stopTimer = this._startTimer("handleLocalOutgoingPaymentFundedEvent");

        const {
            outgoingPayment,
            senderWalletAddressId,
            debitAmount,
            receiveAmount,
            incomingPayment,
        } = event.data;

        const exists = await this._outgoingPaymentRepository.exists(
            outgoingPayment.id
        );

        if (!exists) {
            stopTimer();
            throw new OutgoingPaymentNotFoundError();
        }

        // TODO: FX handling, if receiving wallet asset is different than sending wallet
        const transferRequest = new WalletToWalletAddressLiquidityRequest(
            crypto.randomUUID(),
            senderWalletAddressId,
            incomingPayment.walletAddressId,
            debitAmount,
        );

        const stopTimerLiqSvc = this._startTimer("createOutgoingPaymentFromQuote.liq");
        await this._liquidityService.execute([transferRequest]);
        stopTimerLiqSvc();

        const outgoingPaymentUpdate = this.addMicroPaymentToOutgoingPayment(
            outgoingPayment,
            {
                requestId: outgoingPayment.id,
                amount: outgoingPayment.debitAmount,
                method: "LOCAL",
            }
        );

        const events: LocalEvent[] = [];

        const outgoingPaymentCompletedEvent: OutgoingPaymentCompletedEvent = {
            type: PaymentEventType.OUTGOING_PAYMENT_COMPLETED,
            data: {
                outgoingPayment,
            },
        };

        events.push(outgoingPaymentCompletedEvent);

        const incomingPaymentUpdate = this.addMicroPaymentToIncomingPayment(
            incomingPayment,
            {
                requestId: outgoingPayment.id,
                amount: receiveAmount.value, // TODO: need to send _up to_ to incomingAmount, as the quoted amount might be more
                method: "LOCAL",
            }
        );

        // MicroPayment might have completed the incoming payment
        if (incomingPayment.state === LocalIncomingPaymentState.COMPLETED) {
            const incomingPaymentCompletedEvent: IncomingPaymentCompletedEvent = {
                type: PaymentEventType.INCOMING_PAYMENT_COMPLETED,
                data: {
                    incomingPayment,
                },
            };
            events.push(incomingPaymentCompletedEvent);
        }

        await Promise.all([
            this._outgoingPaymentRepository.updateWithNewMicroPayment(
                outgoingPayment,
                outgoingPaymentUpdate
            ),
            this._incomingPaymentRepository.updateWithNewMicroPayment(
                incomingPayment,
                incomingPaymentUpdate
            ),
        ]);

        stopTimer();
        await this._paymentEventProducer.publish(events);
        this._telemetryService.incrementCounter("outgoing_payments_completed", 1);
    }

    public async handleIlpPaymentFulfillPacketReceivedEvent(event: IlpPaymentFulfillPacketReceivedEvent) {
        const stopTimer = this._startTimer("handleIlpPaymentFulfillPacketReceivedEvent");

        const outgoingPayment = await this._outgoingPaymentRepository.fetchById(
            event.data.outgoingPaymentId
        );

        if (!outgoingPayment) {
            stopTimer();
            throw new OutgoingPaymentNotFoundError();
        }

        if (outgoingPayment.state !== OutgoingPaymentState.FUNDED) {
            stopTimer();
            throw new OutgoingPaymentInvalidStateError();
        }

        if (event.data.amount.assetCode !== outgoingPayment.asset.code) {
            throw new Error("FX during packet handling not implemented");
        }
        // We lost precision
        if (event.data.amount.assetScale > outgoingPayment.asset.scale) {
            stopTimer();
            throw new OutgoingPaymentInvalidStateError();
        }

        const transfer = new WalletAddressToPeerLiquidityRequest(
            event.data.requestId,
            outgoingPayment.senderWalletAddressId,
            event.data.peerId,
            event.data.amount,
        );

        const stopTimerLiqSvc = this._telemetryService.startTimer(
            "command_handler_msg_handler_ms",
            {
                callName: `PaymentService.createOutgoingPaymentFromQuote.liq`,
                description: "TODO",
            }
        );
        await this._liquidityService.execute([transfer]);
        stopTimerLiqSvc();

        const scaledRate = BigInt(
            10 ** (outgoingPayment.asset.scale - event.data.amount.assetScale)
        );

        const microPayment: MicroPayment = {
            requestId: event.data.requestId,
            ilpPeerId: event.data.peerId,
            amount: event.data.amount.value * scaledRate,
            method: "ILP",
        };

        const update = this.addMicroPaymentToOutgoingPayment(
            outgoingPayment,
            microPayment
        );

        const events: LocalEvent[] = [];

        // TODO: do we need to know whether the incoming payment was completed? Or we just need to know that the connection was done/closed?
        // or do we just check the status of the micro

        if (
            // @ts-ignore
            outgoingPayment.state === OutgoingPaymentState.COMPLETED || // Micropayment could have completed payment
            event.data.didCompleteIncomingPayment
        ) {
            outgoingPayment.state = OutgoingPaymentState.COMPLETED;

            const outgoingPaymentCompletedEvent: OutgoingPaymentCompletedEvent = {
                type: PaymentEventType.OUTGOING_PAYMENT_COMPLETED,
                data: {
                    outgoingPayment,
                },
            };
            events.push(outgoingPaymentCompletedEvent);
        }

        await this._outgoingPaymentRepository.updateWithNewMicroPayment(
            outgoingPayment,
            update
        );

        stopTimer();
        await this._paymentEventProducer.publish(events);
        this._telemetryService.incrementCounter("outgoing_payments_completed", 1);
    }

    public async handleIlpPaymentPreparePacketReceivedEvent(
        event: IlpPaymentPreparePacketReceivedEvent
    ) {
        const stopTimer = this._startTimer("handleIlpPaymentPreparePacketReceivedEvent");

        const peer = await this._ilpPeerService.getById(event.data.peerId);

        if (!peer) {
            stopTimer();
            throw new PeerNotFoundError();
        }

        const stopTimerRepo = this._startTimer("incomingPaymentRepository.fetchById");
        const incomingPayment = await this._incomingPaymentRepository.fetchById(
            event.data.incomingPaymentId
        );
        stopTimerRepo();

        if (!incomingPayment) {
            stopTimer();
            // TODO: Send a packet reject event
            throw new IncomingPaymentNotFoundError();
        }

        if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
            stopTimer();
            // TODO: Send a packet reject event
            throw new IncomingPaymentInvalidStateError();
        }

        if (peer.asset.code !== incomingPayment.asset.code) {
            throw new Error("FX during packet handling not implemented");
        }
        if (peer.asset.scale > incomingPayment.asset.scale) {
            stopTimer();
            throw new IncomingPaymentInvalidStateError();
        }
        const transfer = new PeerToWalletAddressLiquidityRequest(
            event.data.requestId,
            event.data.peerId,
            incomingPayment.walletAddressId,
            {
                assetCode: peer.asset.code,
                assetScale: peer.asset.scale,
                value: event.data.amount,
            }
        );

        const stopTimerLiqSvc = this._telemetryService.startTimer(
            "command_handler_msg_handler_ms",
            {
                callName: `PaymentService.createOutgoingPaymentFromQuote.liq`,
                description: "TODO",
            }
        );
        await this._liquidityService.execute([transfer]);
        stopTimerLiqSvc();

        const scaledRate = BigInt(
            10 ** (incomingPayment.asset.scale - peer.asset.scale)
        );

        const microPaymentAmount = event.data.amount * scaledRate;

        const update = this.addMicroPaymentToIncomingPayment(incomingPayment, {
            requestId: event.data.requestId,
            ilpPeerId: event.data.peerId,
            amount: microPaymentAmount,
            method: "ILP",
        });

        const stopTimerRepo2 = this._startTimer("incomingPaymentRepository.updateWithNewMicroPayment");
        await this._incomingPaymentRepository.updateWithNewMicroPayment(incomingPayment, update);
        stopTimerRepo2();

        const paymentEvents: LocalEvent[] = [];

        const incomingPaymentCompleted =
            // @ts-ignore
            incomingPayment.state === LocalIncomingPaymentState.COMPLETED;

        if (incomingPaymentCompleted) {
            const incomingPaymentCompletedEvent: IncomingPaymentCompletedEvent = {
                type: PaymentEventType.INCOMING_PAYMENT_COMPLETED,
                data: {
                    incomingPayment,
                },
            };

            paymentEvents.push(incomingPaymentCompletedEvent);
        }

        const ilpPaymentPreparePacketAcceptedEvent: IlpPaymentPreparePacketAcceptedEvent =
            {
                type: PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_ACCEPTED,
                data: {
                    amount: {
                        assetCode: incomingPayment.asset.code,
                        assetScale: incomingPayment.asset.scale,
                        value: microPaymentAmount,
                    },
                    incomingPaymentCompleted,
                    requestId: event.data.requestId,
                },
            };

        paymentEvents.push(ilpPaymentPreparePacketAcceptedEvent);

        stopTimer();
        await this._paymentEventProducer.publish(paymentEvents);
    }

    public async handleIlpQuotePacketReceived(
        event: IlpQuotePacketReceivedEvent
    ): Promise<void> {
        const stopTimer = this._startTimer("handleIlpQuotePacketReceived");
        const exists = await this._quoteRepository.exists(event.data.quoteId);

        if (!exists) {
            stopTimer();
            throw new QuoteNotFoundError();
        }

        await this._quoteRepository.updateAmounts({
            id: event.data.quoteId,
            amount: event.data.amount,
        });
        stopTimer();
    }
}
