export declare interface IRawAuthenticationOptions {
  protocol: 'plaintext' | 'ssl' | 'sasl_plaintext' | 'sasl_ssl';
  mechanism: 'PLAIN' | 'GSSAPI' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512';
  username: string;
  password: string;
}
