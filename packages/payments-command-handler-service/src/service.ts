import {
  RafikiKafkaJsonProducer,
  RafikiKafkaJsonConsumer
} from 'implementations-lib';
import {
  MongoDbIncomingPaymentRepo,
  PalWalletAddressAdapter
} from 'payments-implementations-lib';
import { IncomingPaymentAggregate } from 'payments-domain-lib';
import { PalClient } from 'pal-client-lib';
import { PaymentsCommandHandler } from './cmd-handler';
import process from 'process';

const KAFKA_URL = process.env['KAFKA_URL'] || 'localhost:9092';
const MONGODB_URL =
  process.env['MONGODB_URL'] || 'mongodb://localhost:27017';
const PAL_GRPC_URL = process.env['PAL_GRPC_URL'] || 'localhost:50051';
const CONSUMER_BATCH_SIZE =
  (process.env['CONSUMER_BATCH_SIZE'] &&
    parseInt(process.env['CONSUMER_BATCH_SIZE'])) ||
  250;
const CONSUMER_BATCH_TIMEOUT_MS =
  (process.env['CONSUMER_BATCH_TIMEOUT_MS'] &&
    parseInt(process.env['CONSUMER_BATCH_TIMEOUT_MS'])) ||
  50;

export class PaymentsCommandHandlerService {
  private static commandHandler: PaymentsCommandHandler;
  private static msgProducer: RafikiKafkaJsonProducer;
  private static msgConsumer: RafikiKafkaJsonConsumer;
  private static repo: MongoDbIncomingPaymentRepo;

  static async start(): Promise<void> {
    // Adapters
    this.repo = new MongoDbIncomingPaymentRepo(MONGODB_URL);
    await this.repo.init();

    const palClient = new PalClient(PAL_GRPC_URL);
    const walletAddressPort = new PalWalletAddressAdapter(palClient);

    // Aggregate
    const aggregate = new IncomingPaymentAggregate(
      this.repo,
      walletAddressPort
    );

    // Kafka
    this.msgProducer = new RafikiKafkaJsonProducer({
      kafkaBrokerList: KAFKA_URL,
      producerClientId: `payments-cmd-handler-${crypto.randomUUID()}`
    });
    await this.msgProducer.connect();

    this.msgConsumer = new RafikiKafkaJsonConsumer({
      kafkaBrokerList: KAFKA_URL,
      kafkaGroupId: 'payments-cmd-handler',
      batchSize: CONSUMER_BATCH_SIZE,
      batchTimeoutMs: CONSUMER_BATCH_TIMEOUT_MS
    });

    // Command handler
    this.commandHandler = new PaymentsCommandHandler(
      this.msgConsumer,
      this.msgProducer,
      aggregate
    );
    await this.commandHandler.start();
  }

  static async stop(): Promise<void> {
    await this.commandHandler.stop();
    await this.msgProducer.disconnect();
    await this.repo.destroy();
  }
}
