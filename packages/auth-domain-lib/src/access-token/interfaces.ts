export type NewAccessToken = Omit<IAccessToken, 'revokedAt'>;

export type RevokedAccessToken = IAccessToken & {
  revokedAt: Date;
};

export interface IAccessToken {
  id: string;
  value: string;
  managementId: string;
  expiresIn: number;
  revokedAt?: Date;
}
