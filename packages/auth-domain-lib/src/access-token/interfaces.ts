export type NewAccessToken = Omit<IAccessToken, 'revokedAt'>;

export type RevokedAccessToken = IAccessToken & {
  revokedAt: Date;
};

export interface IAccessToken {
  value: string;
  grantId: string;
  managementId: string;
  expiresIn: number;
  createdAt: Date;
  revokedAt?: Date;
}
