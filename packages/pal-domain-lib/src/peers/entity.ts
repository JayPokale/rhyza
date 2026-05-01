/*
// /!*
//
// export interface IPalPeer {
//   id:string;
//   name: string;
//   assetCode: string;
//   assetScale: number;
// }
//
// export interface IPalPeerCommunicationMethod {
//   type: "ILP";
//   staticAddress: string; // for matching
// }
//
// export class PalPeer implements PalPeer {
//   private readonly _id:string;
//   private readonly _name: string;
//   private readonly _assetCode: string;
//   private readonly _assetScale: number;
//
//   private readonly _communicationMethod: IPalPeerCommunicationMethod;
//
//   private readonly _active: boolean; // maybe a getter that checks if the peer is active using other characteristics
//
//   constructor(
//     code: string,
//     scale: number
//   ) {
//     this._code = code;
//     this._scale = scale;
//   }
//
//   static fromObject(json: IPalAsset): PalAsset {
//     return new PalAsset(
//       json.code,
//       json.scale,
//       json.liquidityLowThreshold,
//       json.liquidityHighThreshold
//     );
//   }
//
//   toObject(): IPalAsset {
//     return {
//       code: this._code,
//       scale: this._scale,
//       liquidityLowThreshold: this._liquidityLowThreshold,
//       liquidityHighThreshold: this._liquidityHighThreshold
//     };
//   }
//
//   get code(): string {
//     return this._code;
//   }
//
//   get scale(): number {
//     return this._scale;
//   }
//
//   get liquidityLowThreshold(): bigint | null {
//     return this._liquidityLowThreshold;
//   }
//
//   get liquidityHighThreshold(): bigint | null {
//     return this._liquidityHighThreshold;
//   }
// }
// *!/
*/
