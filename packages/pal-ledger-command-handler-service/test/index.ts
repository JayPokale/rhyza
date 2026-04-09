/*****
 Contributors

 * Interledger Foundation
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>

 --------------
 ******/

"use strict";


import {
  KafkaProducer,
  KafkaProducerCompressionCodecs,
  KafkaProducerOptions,
  MessageSerializationFactory,
  RafikiKafkaJsonConsumerOptions
} from "implementations-lib";
import {CommandMsg, ConsoleLogger, IMessageProducer} from "common-types-lib";
import {CreateLedgerAccountCmd, CreateLedgerCmd, PostTransactionCmd} from "pal-domain-lib";
import {
  LedgerAccountCreatedStateEventSerde,
  LedgerCreatedStateEventSerde,
  LedgerSnapshotSerde,
  LedgerTransactionRecordedStateEventSerde
} from "pal-implementations-lib";

const INSTANCE_ID = `ES_LEDGER_POC_TEST__${crypto.randomUUID()}`;
// Message Consumer/Publisher
const KAFKA_URL = process.env["KAFKA_URL"] || "127.0.0.1:19092,127.0.0.1:29092,127.0.0.1:39092";

// kafka common options
const kafkaProducerCommonOptions:KafkaProducerOptions = {
    kafkaBrokerList: KAFKA_URL,
    producerClientId: `${INSTANCE_ID}`,
    compressionCodec: KafkaProducerCompressionCodecs.LZ4,
    queueBufferingMaxMessages: 500_000,
    messageMaxBytes: 20971520
};
const kafkaConsumerCommonOptions:RafikiKafkaJsonConsumerOptions ={
    kafkaBrokerList: KAFKA_URL
};

const assetCode = "EUR";
const pedroAccId = "pedro";
const elsaAccId = "elsa";

let producer: IMessageProducer;

const CREATE_LEDGER_AND_ACCOUNTS = false;
const TRANSACTION_COUNT = process.env["TRANSACTION_COUNT"] ? parseInt(process.env["TRANSACTION_COUNT"]) : 10;

function getRandomPair(array: string[]): [string, string] | undefined {
  if (array.length < 2) return undefined;

  const firstIndex = Math.floor(Math.random() * array.length);
  let secondIndex = Math.floor(Math.random() * array.length);

  while (secondIndex === firstIndex) {
    secondIndex = Math.floor(Math.random() * array.length);
  }

  return [array[firstIndex], array[secondIndex]];
}

function createLedgerAndAccounts():CommandMsg[]{
    const cmd1 = new CreateLedgerCmd({id: "EUR"});
    const cmd2 = new CreateLedgerAccountCmd(
        assetCode,
        {id: pedroAccId, assetCode: assetCode, assetDisplayScale: 2, name: "EUR acc pedro"}
    )
    const cmd3 = new CreateLedgerAccountCmd(
        assetCode,
        {id: elsaAccId, assetCode: assetCode, assetDisplayScale: 2, name: "EUR acc elsa"}
    )
    return [cmd1, cmd2, cmd3];
}

async function main() {
    MessageSerializationFactory.instance()
      // snapshots
      .register(new LedgerSnapshotSerde())
      // state events
      .register(new LedgerCreatedStateEventSerde())
      .register(new LedgerAccountCreatedStateEventSerde())
      .register(new LedgerTransactionRecordedStateEventSerde())

    producer = new KafkaProducer(kafkaProducerCommonOptions, MessageSerializationFactory.instance(), new ConsoleLogger());
    await producer.connect();

    const cmds: CommandMsg[] = [];

    if(CREATE_LEDGER_AND_ACCOUNTS) {
        cmds.push(...createLedgerAndAccounts());
    }

    for(let i = 0; i < TRANSACTION_COUNT; i++){
        //let amount = "1"; //BigInt(Math.round(Math.random() * 1000));
        let amount = BigInt(Math.round(Math.random() * 1000)).toString();
        const [sender, receiver] = getRandomPair([pedroAccId, elsaAccId]) || [pedroAccId, elsaAccId];

        cmds.push(new PostTransactionCmd(assetCode, {
            id: i.toString(),
            amount:amount,
            amountScale: 2,
            debitedAccountId: sender,
            creditedAccountId: receiver
        }));

    }
    await producer.sendWithAck(cmds);

    console.log("Transactions posted.");

}

// eslint-disable-next-line
main().then(() => {
    console.log("Done")
    process.exit(0);
});
