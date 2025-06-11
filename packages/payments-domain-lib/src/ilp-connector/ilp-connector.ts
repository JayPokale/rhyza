"use strict";

import {
    deserializeIlpPrepare,
    deserializeIlpReply,
    IlpFulfill,
    IlpPrepare,
    IlpReject,
    isFulfill,
    serializeIlpFulfill,
    serializeIlpPrepare,
    serializeIlpReject,
} from "ilp-packet";
import {
    IlpPaymentFulfillPacketReceivedEvent,
    IlpPaymentPreparePacketAcceptedEvent,
    IlpPaymentPreparePacketReceivedEvent,
    IlpQuotePacketReceivedEvent,
    PaymentEventType,
    RemoteOutgoingPaymentFundedEvent,
    RemoteQuoteRequestedEvent,
} from "../payments";
import {IIlpPeerService} from "../ilp-peer";
import {createHash, randomBytes} from "crypto";
import {ILocalEventProducerAdapter} from "common-types-lib";

class IlpPeerNotFoundByAddressError extends Error {
}

class IlpPeerNotFoundError extends Error {
}

export interface IlpDetails {
    sharedSecret: string;
    destinationAddress: string;
}

export const STATIC_FULFILLMENT = Buffer.alloc(32);
export const STATIC_CONDITION = createHash("SHA256")
    .update(STATIC_FULFILLMENT)
    .digest();

interface IncomingIlpRequest {
    id: string;
    peerId: string;
    incomingPaymentId: string;
}

interface OutgoingIlpRequest {
    id: string;
    peerId: string;
    outgoingPaymentId?: string;
    quoteId?: string;
}

interface SendPreparePacketArgs {
    url: string;
    packet: IlpPrepare;
    requestId: string;
}

interface SendFulfillPacketArgs {
    url: string;
    packet: IlpFulfill;
    requestId: string;
}

interface SendRejectPacketArgs {
    url: string;
    packet: IlpReject;
    requestId: string;
}

interface IlpOverHttpRequestArgs {
    requestId: string;
    url: string;
    body: Buffer;
}

export interface IIlpConnector {
    getIlpDetails(): IlpDetails;

    handlePreparePacket(
        packetId: string,
        peerDestinationAddress: string,
        rawPreparePacket: Buffer
    ): Promise<void>;

    handleFulfillOrRejectPacket(
        packetId: string,
        rawPreparePacket: Buffer
    ): Promise<void>;

    handlePrepareQuotePacket(
        requestId: string,
        peerDestinationAddress: string,
        packet: IlpPrepare
    ): Promise<void>;

    handleRemoteQuoteRequestedEvent(
        event: RemoteQuoteRequestedEvent
    ): Promise<void>;

    handleRemoteOutgoingPaymentFundedEvent(
        event: RemoteOutgoingPaymentFundedEvent
    ): Promise<void>;

    handlePreparePaymentPacket(
        requestId: string,
        peerDestinationAddress: string,
        preparePacket: IlpPrepare
    ): Promise<void>;

    handlePaymentPreparePacketAcceptedEvent(
        event: IlpPaymentPreparePacketAcceptedEvent
    ): Promise<void>;
}

export class IlpConnector implements IIlpConnector {
    ownDestinationAddress = "";

    private incomingRequests = new Map<string, IncomingIlpRequest>(); // TODO: delete requests when no longer needed
    private outgoingRequests = new Map<string, OutgoingIlpRequest>(); // TODO: delete requests when no longer needed

    constructor(
        ownDestinationAddress: string,
        private peerService: IIlpPeerService,
        private eventProducer: ILocalEventProducerAdapter
    ) {
        this.ownDestinationAddress = ownDestinationAddress;
    }

    getIlpDetails(): IlpDetails {
        return {
            sharedSecret: "", // TODO
            destinationAddress: this.ownDestinationAddress,
        };
    }

    async handlePreparePacket(
        packetId: string,
        peerDestinationAddress: string,
        rawPreparePacket: Buffer
    ): Promise<void> {
        const deserializedPacket = deserializeIlpPrepare(rawPreparePacket);

        // Using static condition & fulfillment to differentiate payments vs quotes for now.
        if (deserializedPacket.executionCondition.equals(STATIC_CONDITION)) {
            return this.handlePreparePaymentPacket(
                packetId,
                peerDestinationAddress,
                deserializedPacket
            );
        } else {
            return this.handlePrepareQuotePacket(
                packetId,
                peerDestinationAddress,
                deserializedPacket
            );
        }
    }

    async handleFulfillOrRejectPacket(
        packetId: string,
        rawPreparePacket: Buffer
    ): Promise<void> {
        const request = this.outgoingRequests.get(packetId)!;
        const peer = await this.peerService.getById(request.peerId);

        if (!peer) {
            throw new IlpPeerNotFoundError();
        }

        const deserializedPacket = deserializeIlpReply(rawPreparePacket);

        if (isFulfill(deserializedPacket)) {
            const event: IlpPaymentFulfillPacketReceivedEvent = {
                type: PaymentEventType.ILP_PAYMENT_FULFILL_PACKET_RECEIVED,
                data: {
                    requestId: packetId,
                    peerId: request.peerId,
                    outgoingPaymentId: request.outgoingPaymentId!,
                    didCompleteIncomingPayment: false,
                    amount: {
                        assetCode: peer.asset.code,
                        assetScale: peer.asset.scale,
                        value: BigInt(deserializedPacket.data.toString()),
                    },
                },
            };
            await this.eventProducer.publish([event]);
        } else {
            if (request.quoteId) {
                const event: IlpQuotePacketReceivedEvent = {
                    type: PaymentEventType.ILP_QUOTE_PREPARE_PACKET_RECEIVED,
                    data: {
                        requestId: packetId,
                        peerId: request.peerId,
                        quoteId: request.quoteId,
                        amount: BigInt(deserializedPacket.data.toString()),
                    },
                };
                await this.eventProducer.publish([event]);
            }
        }
    }

    async handlePrepareQuotePacket(
        requestId: string,
        peerDestinationAddress: string,
        packet: IlpPrepare
    ) {
        const peer = await this.peerService.getByDestinationAddress(
            peerDestinationAddress
        );

        if (!peer) {
            throw new IlpPeerNotFoundError();
        }

        // TODO: instead, this should include an event to get rates from payment service (and check for incoming payment existence)
        const rejectPacket = {
            code: "F05",
            message: "test",
            triggeredBy: this.ownDestinationAddress,
            data: Buffer.from(packet.amount),
        };

        await this.sendRejectPacket({
            url: peer.callbackUrl,
            packet: rejectPacket,
            requestId,
        });
    }

    async handleRemoteQuoteRequestedEvent(
        event: RemoteQuoteRequestedEvent
    ) {
        const destination =
            event.data.incomingPayment.ilpDetails.destinationAddress;

        // TODO: Can potentially receive an event from peer service instead with peer information already there
        // or listen to peer updates/creates/etc and keep track of peers within this domain itself
        const peer = await this.peerService.getByDestinationAddress(destination);

        if (!peer) {
            throw new IlpPeerNotFoundByAddressError();
        }

        const preparePacket: IlpPrepare = {
            amount: event.data.quote.debitAmount.value.toString(),
            executionCondition: Buffer.from(randomBytes(32)),
            expiresAt: new Date(Date.now() + 10 * 1000),
            destination,
            data: Buffer.alloc(0),
        };

        const outgoingRequest: OutgoingIlpRequest = {
            id: crypto.randomUUID(),
            peerId: peer.id,
            quoteId: event.data.quote.id,
        };

        this.outgoingRequests.set(outgoingRequest.id, outgoingRequest);

        await this.sendPreparePacket({
            url: peer.connectorUrl,
            packet: preparePacket,
            requestId: outgoingRequest.id,
        });
    }

    async handleRemoteOutgoingPaymentFundedEvent(
        event: RemoteOutgoingPaymentFundedEvent
    ) {
        const destination = event.data.ilpDetails.destinationAddress;

        const peer = await this.peerService.getByDestinationAddress(destination);

        if (!peer) {
            throw new IlpPeerNotFoundByAddressError();
        }

        const outgoingRequest: OutgoingIlpRequest = {
            id: crypto.randomUUID(),
            peerId: peer.id,
            outgoingPaymentId: event.data.outgoingPaymentId,
        };

        this.outgoingRequests.set(outgoingRequest.id, outgoingRequest);

        const preparePacket: IlpPrepare = {
            amount: event.data.debitAmount.value.toString(),
            executionCondition: STATIC_CONDITION,
            expiresAt: new Date(Date.now() + 10 * 1000),
            destination,
            data: Buffer.from(event.data.remoteIncomingPaymentUrl),
        };

        await this.sendPreparePacket({
            url: peer.connectorUrl,
            packet: preparePacket,
            requestId: outgoingRequest.id,
        });
    }

    async handlePreparePaymentPacket(
        requestId: string,
        peerDestinationAddress: string,
        preparePacket: IlpPrepare
    ) {
        const peer = await this.peerService.getByDestinationAddress(
            peerDestinationAddress
        );

        if (!peer) {
            throw new IlpPeerNotFoundByAddressError();
        }

        const incomingPaymentId = preparePacket.data.toString();

        this.incomingRequests.set(requestId, {
            id: requestId,
            peerId: peer.id,
            incomingPaymentId: incomingPaymentId,
        });

        const event: IlpPaymentPreparePacketReceivedEvent = {
            type: PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_RECEIVED,
            data: {
                requestId: requestId,
                amount: BigInt(preparePacket.amount),
                peerId: peer.id,
                incomingPaymentId,
            },
        };

        await this.eventProducer.publish([event]);
    }

    async handlePaymentPreparePacketAcceptedEvent(
        event: IlpPaymentPreparePacketAcceptedEvent
    ) {
        const request = this.incomingRequests.get(event.data.requestId)!;
        const peer = await this.peerService.getById(request.peerId);

        if (!peer) {
            throw new IlpPeerNotFoundError();
        }

        const fulfillPacket = {
            fulfillment: STATIC_FULFILLMENT,
            data: Buffer.from(event.data.amount.value.toString()),
        };

        await this.sendFulfillPacket({
            url: peer.callbackUrl,
            packet: fulfillPacket,
            requestId: event.data.requestId,
        });
    }

    private async sendPreparePacket(args: SendPreparePacketArgs): Promise<void> {
        const {url, packet, requestId} = args;

        await this.makeIlpHttpRequest({
            url,
            body: serializeIlpPrepare(packet),
            requestId,
        });
    }

    private async sendFulfillPacket(args: SendFulfillPacketArgs): Promise<void> {
        const {url, packet, requestId} = args;

        await this.makeIlpHttpRequest({
            url,
            body: serializeIlpFulfill(packet),
            requestId,
        });
    }

    private async sendRejectPacket(args: SendRejectPacketArgs): Promise<void> {
        const {url, packet, requestId} = args;

        return this.makeIlpHttpRequest({
            url,
            body: serializeIlpReject(packet),
            requestId,
        });
    }

    private async makeIlpHttpRequest(
        args: IlpOverHttpRequestArgs
    ): Promise<void> {
        const {url, body, requestId} = args;

        await fetch(url, {
            method: "POST",
            body,
            headers: {
                "request-id": requestId,
                "from-peer": this.ownDestinationAddress, // TODO: should be some authenticated mechanism between peers
                "response-type": "arraybuffer",
                "Content-Type": "application/octet-stream",
            },
        });
    }
}
