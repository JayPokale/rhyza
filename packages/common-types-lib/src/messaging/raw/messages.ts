export interface IRawMessageHeader {
    [key: string]: string | Buffer;
}

export interface IRawMessage {
    value: Buffer | string | object | null;
    topic: string;
    key: Buffer | string | null;
    timestamp: number | null;
    headers: IRawMessageHeader[] | null;

    partition: number | null;
    offset: number | null;
}
