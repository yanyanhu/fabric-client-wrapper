// @flow

import type Peer from "fabric-client/lib/Peer"
import type TransactionID from "fabric-client/lib/TransactionID"

export type ProposalResponse = Object
export type ProposalResponseObject = Object
export type Proposal = Object

export type IdentityPEMs = {
    privateKeyPEM: string,
    signedCertPEM: string
}

export type UserOpts = {
    username: string,
    mspid: string,
    cryptoContent: IdentityPEMs
}

export type TransactionRequest = {
    proposalResponses: Array<ProposalResponse>,
    proposal: Proposal
}

export type ConnectionOpts = {
    "request-timeout": number,
    pem: string,
    "ssl-target-name-override": string,
    [any: string]: any
}

export type ChannelEnvelope = Object
export type ChannelConfig = Object
export type ConfigSignature = Object
export type ChaincodeInvokeRequest = {
    targets?: Array<Peer>,
    chaincodeId: string,
    txId: TransactionID,
    transientMap?: Object,
    fcn?: string,
    args: string
}

export type ChaincodeInstantiateUpgradeRequest = {
    targets?: Array<Peer>,
    chaincodeType?: string,
    chaincodeId: string,
    chaincodeVersion: string,
    txId: TransactionID,
    transientMap?: Object,
    fcn?: string,
    args: string,
    "endorsement-policy"?: Object
}

export type ChaincodeInstallRequest = {
    targets: Array<Peer>,
    chaincodeId: string,
    chaincodePath: string,
    chaincodeVersion: string,
    chaincodePackage?: Object,
    chaincodeType?: string
}

export type Policy = {
    identities: Array<Object>,
    policy: Object
}
