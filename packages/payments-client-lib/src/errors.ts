export class RemoteQuotingNotConfiguredError extends Error {
  constructor() {
    super(
      'openPaymentsUrl is required for remote quotes — pass it to the PaymentsClient constructor'
    );
  }
}
