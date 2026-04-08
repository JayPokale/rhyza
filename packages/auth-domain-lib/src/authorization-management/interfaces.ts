import { AccessItem } from "../shared/interfaces";

export interface AccessToken {
  value: string;
  manage: string;
  expiresIn: number;
  access: AccessItem[];
}
