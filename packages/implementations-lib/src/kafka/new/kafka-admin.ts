import {KafkaJS} from "@confluentinc/kafka-javascript";
import {ILogger} from "common-types-lib";
import {IKafkaAdmin} from "./types";

const DEFAULT_TIMEOUT_MS = 10000;

export class KafkaAdmin implements IKafkaAdmin {
  private readonly _logger: ILogger;
  private readonly _kafka: KafkaJS.Kafka;
  private readonly _admin: KafkaJS.Admin;

  constructor(kafka: KafkaJS.Kafka, logger: ILogger) {
    this._logger = logger;
    this._kafka = kafka;
    this._admin = kafka.admin();
  }

  async createTopics(topics: {topic:string, numPartitions: number, replicationFactor: number}[]): Promise<void> {
    await this._admin.createTopics({
      timeout: DEFAULT_TIMEOUT_MS,
      topics: topics
    });
  }
}
