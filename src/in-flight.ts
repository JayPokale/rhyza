import {CommandMsg, IMessageProducer} from "./message-broker/message";
import {randomUUID} from "crypto";
import logger from "./logger";

export interface ApiProcess<T, J> {
  requestId: string
  request: T
  response?: J
  error?: Error
}

export class InFlightProcessor<T extends CommandMsg> {
  private mapRsp: Map<string, Object | Error>;
  private producer: IMessageProducer;

  constructor(producer: IMessageProducer, mapRsp: Map<string, Object | Error>) {
    this.producer = producer
    this.mapRsp = mapRsp
  }

  public async awaitProcessResponse(
    timeoutSeconds: number,
    throwIfError: boolean,
    request: T
  ): Promise<ApiProcess<T, Object>> {
    const requestId = randomUUID()
    request.setRequestId(requestId)

    await this.producer.send(request)

    const start = Date.now()
    logger.debug(`Starting processing at ${start} for ${requestId}`)
    do {
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (!this.mapRsp.has(requestId) && (Date.now() - start < timeoutSeconds * 1000))

    const rsp = this.mapRsp.get(requestId)
    this.mapRsp.delete(requestId)
    logger.debug(`Finished processing at ${Date.now()} for ${requestId}, got ${JSON.stringify(rsp)}`)

    var error: Error | undefined = undefined
    if (rsp && typeof rsp === 'object' &&
      ('isCmdErrorResponse' in rsp && 'message' in rsp)) {
      error = new Error(`${rsp.message}`)
    } else if (!rsp) {
      // No response, timeout:
      error = new Error(`No response received for '${requestId}' within ${timeoutSeconds} seconds.`)
    }

    if (throwIfError && error !== undefined) throw rsp

    return {
      error: error,
      request,
      requestId,
      response: error ? undefined : rsp,
    }
  }
}


