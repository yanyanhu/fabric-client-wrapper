// @flow
// /**
//  * Copyright 2017 IBM All Rights Reserved.
//  *
//  * Licensed under the Apache License, Version 2.0 (the 'License');
//  * you may not use this file except in compliance with the License.
//  * You may obtain a copy of the License at
//  *
//  *    http://www.apache.org/licenses/LICENSE-2.0
//  *
//  *  Unless required by applicable law or agreed to in writing, software
//  *  distributed under the License is distributed on an 'AS IS' BASIS,
//  *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  *  See the License for the specific language governing permissions and
//  *  limitations under the License.
//  */

import _ from 'lodash/fp'
import { remove } from 'lodash/array'
import type Channel from 'fabric-client/lib/Channel'
import type Peer from 'fabric-client/lib/Peer'
import type TransactionID from 'fabric-client/lib/TransactionID'
import type { TransactionRequest, ChaincodeInstallRequest } from './FABRIC_FLOW_TYPES'
import type { FcwChaincodeInstantiateUpgradeRequest } from './shared'
import { isFcwPeer } from './fabric-client-extended'
import type UserClient, { CreateChannelOpts, TransactionProposalOpts, JoinChannelOpts } from './UserClient'

/** Class representing multiple UserClient instances, can be used for making channel/chaincode operations
* @param userClients - The UserClient instances to use
* @param mainUserClient - The UserClient instance to use for requests that only require a single UserClient
*/
export default class MultiUserClient {
    userClients: Array<UserClient>
    mainUserClient: UserClient

    constructor(userClients: Array<UserClient>, mainUserClient?: UserClient) {
        this.userClients = userClients
        if (mainUserClient) {
            this.mainUserClient = mainUserClient
        } else {
            this.mainUserClient = userClients[0]
        }
    }

    /**
    * Returns the underlying UserClient instances
    */
    getUserClients(): Array<UserClient> {
        return this.userClients
    }

    /**
    * Returns the main UserClient instance
    */
    getMainUserClient(): UserClient {
        return this.mainUserClient
    }

    /**
    * Returns a new TransactionID object. Fabric transaction ids are constructed as a hash of a nonce concatenated with the signing identity's serialized bytes. The TransactionID object keeps the nonce and the resulting id string bundled together as a coherent pair.
    */
    newTransactionID(): TransactionID {
        return this.mainUserClient.newTransactionID()
    }

    /**
    * Creates a channel instance bound to the user
    * @param channel - the channel object to use
    * @returns The new bound channel instance
    */
    bindChannel(channel: Channel): Channel {
        return this.mainUserClient.bindChannel(channel)
    }

    /**
    * Gets the genesis block for the channel
    * @param channel - The channel object to use
    */
    getChannelGenesisBlock(channel: Channel) {
        return this.mainUserClient.getChannelGenesisBlock(channel)
    }

    /**
    * Initializes a channel
    * @param channel - The channel object to use
    */
    initializeChannel(channel: Channel) {
        return this.mainUserClient.initializeChannel(channel)
    }

    /**
    * Calls the orderer to start building the new channel. A channel typically has more than one participating organizations. To create a new channel, one of the participating organizations should call this method to submit the creation request to the orderer service. Once the channel is successfully created by the orderer, the next step is to have each organization's peer nodes join the channel, by sending the channel configuration to each of the peer nodes. The step is accomplished by calling the joinChannel() method.
    * @param channel - The channel object to users
    * @param createChannelOpts - The options for building a new channel on the network
    * @param {Array<byte>} [createChannelOpts.channelEnvelope] - The envelope for the new channel, required if no config is specified
    * @param {Array<byte>} [createChannelOpts.channelConfig] - The configuration for the new channel, required if no envelope is specified
    * @param {Array<ConfigSignature>} [createChannelOpts.signatures] - The signatures required for the new chanel, required if no envelope is specified
    * @param {number} [createChannelOpts.timeout=60000] - The maximum number of ms to wait for the channel to be created
    * @returns Promise containing the status of the create channel order, note that the wait function returns the genesis block
    */
    async createChannel(
        channel: Channel,
        createChannelOpts: CreateChannelOpts
    ): Promise<{
        data: Object,
        wait: () => Promise<Object>,
    }> {
        return this.mainUserClient.createChannel(channel, createChannelOpts)
    }

    /**
    * Calls the orderer to update an existing channel. After the channel updates are successfully processed by the orderer, the orderer cuts a new block containing the new channel configuration and delivers it to all the participating peers in the channel.
    * @param channel - The channel object to users
    * @param updateChannelOpts - The options for updating a channel on the network
    * @param {Array<byte>} [updateChannelOpts.channelEnvelope] - The envelope for the new channel, required if no config is specified
    * @param {Array<byte>} [updateChannelOpts.channelConfig] - The configuration for the new channel, required if no envelope is specified
    * @param {Array<ConfigSignature>} [updateChannelOpts.signatures] - The signatures required for the new chanel, required if no envelope is specified
    * @param {number} [updateChannelOpts.timeout=60000] - The maximum number of ms to wait for the channel to be created
    * @returns Promise containing the status of the update channel order
    */
    async updateChannel(
        channel: Channel,
        createChannelOpts: CreateChannelOpts
    ): Promise<{
        data: Object,
        wait: () => Promise<any>,
    }> {
        return this.mainUserClient.updateChannel(channel, createChannelOpts)
    }

    /**
    * This method sends a join channel proposal to one or more endorsing peers.
    * @param channel - The channel object to use
    * @param [joinChannelOpts] - The options for joining the channel
    * @param {Array<Peer>} [joinChannelOpts.targets] - An array of Peer objects or Peer names that will be asked to join this channel.
    * @param {GenesisBlock} [joinChannelOpts.genesisBlock] - The genesis block for the channel
    * @param {number} [joinChannelOpts.timeout=60000] - The maximum number of ms to wait for a peers to join
    * @returns a promise containing an array of proposal response objects
    */
    async joinChannel(
        channel: Channel,
        joinChannelOpts?: JoinChannelOpts
    ): Promise<{
        data: Array<Array<Object>>,
        wait: () => Promise<any>,
    }> {
        const peers = _.clone(channel.getPeers().filter(peer => isFcwPeer(peer)))
        const joinChannelCalls = []
        this.userClients.forEach(userClient => {
            const ownedPeers = remove(peers, peer =>
                peer.getAdminMspIds().includes(userClient.getOrganizationConfig().mspId)
            )
            if (ownedPeers.length > 0) {
                const ownedPeersJoinChannelOpts = {
                    ...joinChannelOpts,
                    targets: ownedPeers,
                }
                joinChannelCalls.push(userClient.joinChannel(channel, ownedPeersJoinChannelOpts))
            }
        })
        const joinChannelResponses = await Promise.all(joinChannelCalls)

        return {
            data: joinChannelResponses.map(joinChannelResponse => joinChannelResponse.data),
            wait: () => Promise.all(joinChannelResponses.map(joinChannelResponse => joinChannelResponse.wait())),
        }
    }

    /**
    * In fabric v1.0, a chaincode must be installed and instantiated before it can be called to process transactions. Chaincode installation is simply uploading the chaincode source and dependencies to the peers. This operation is "channel-agnostic" and is performed on a peer-by-peer basis. Only the peer organization's ADMIN identities are allowed to perform this operation.
    * @param {ChaincodeInstallRequest} chaincodeInstallRequest - The chaincode install request to be made
    * @param {Array<Peer>} chaincodeInstallRequest.targets - An array of Peer objects that the chaincode will be installed on
    * @param {string} chaincodeInstallRequest.chaincodePath - The path to the location of the source code of the chaincode. If the chaincode type is golang, then this path is the fully qualified package name, such as 'mycompany.com/myproject/mypackage/mychaincode'
    * @param {string} chaincodeInstallRequest.chaincodeId - Name of the chaincode
    * @param {string} chaincodeInstallRequest.chaincodeVersion - Version string of the chaincode, such as 'v1'
    * @param {string} [chaincodeInstallRequest.chaincodePackage] - Byte array of the archive content for the chaincode source. The archive must have a 'src' folder containing subfolders corresponding to the 'chaincodePath' field. For instance, if the chaincodePath is 'mycompany.com/myproject/mypackage/mychaincode', then the archive must contain a folder 'src/mycompany.com/myproject/mypackage/mychaincode', where the GO source code resides.
    * @param {string} [chaincodeInstallRequest.chaincodeType] -  Type of chaincode. One of 'golang', 'car' or 'java'. Default is 'golang'. Note that 'java' is not supported as of v1.0.
    * @param {number} [timeout] - A number indicating milliseconds to wait on the response before rejecting the promise with a timeout error. This overrides the default timeout of the Peer instance and the global timeout in the config settings.
    * @returns a promise containing a proposal response object
    */
    async installChaincode(
        chaincodeInstallRequest: ChaincodeInstallRequest,
        timeout?: number
    ): Promise<{
        data: Array<Object>,
    }> {
        const peers = _.clone(chaincodeInstallRequest.targets.filter(peer => isFcwPeer(peer)))
        const installChaincodeCalls = []
        this.userClients.forEach(userClient => {
            const ownedPeers = remove(peers, peer =>
                peer.getAdminMspIds().includes(userClient.getOrganizationConfig().mspId)
            )
            if (ownedPeers.length > 0) {
                const ownedPeersChaincodeInstallRequest = {
                    ...chaincodeInstallRequest,
                    targets: ownedPeers,
                }
                installChaincodeCalls.push(userClient.installChaincode(ownedPeersChaincodeInstallRequest, timeout))
            }
        })
        const installChaincodeResponses = await Promise.all(installChaincodeCalls)
        return {
            data: installChaincodeResponses.map(installChaincodeResponse => installChaincodeResponse.data),
        }
    }

    /**
    * Sends a chaincode instantiate proposal to one or more endorsing peers. A chaincode must be instantiated on a channel-by-channel basis before it can be used. The chaincode must first be installed on the endorsing peers where this chaincode is expected to run
    * @param channel - The channel to use
    * @param chaincodeInstantiateRequest - The chaincode instantiation request to be made
    * @param {Array<Peer>} [chaincodeInstantiateRequest.targets] - An array of Peer objects that are used to satisfy the instantiation policy. Defaults to channel peers if not specified
    * @param {Policy} [chaincodeInstantiateRequest.targetsPolicy] - A policy used to select peers from the channel if targets is not specified
    * @param {string} chaincodeInstantiateRequest.chaincodeId - Name of the chaincode
    * @param {string} chaincodeInstantiateRequest.chaincodeVersion - Version string of the chaincode, such as 'v1'
    * @param {string} [chaincodeInstantiateRequest.chaincodeType] -  Type of chaincode. One of 'golang', 'car' or 'java'. Default is 'golang'. Note that 'java' is not supported as of v1.0.
    * @param {Map} [chaincodeInstantiateRequest.transientMap] - Map that can be used by the chaincode during intialization, but not saved in the ledger. Data such as cryptographic information for encryption can be passed to the chaincode using this technique
    * @param {string} [chaincodeInstantiateRequest.fcn] - The function name to be returned when calling stub.GetFunctionAndParameters() in the target chaincode. Default is 'init'
    * @param {string[]} [chaincodeInstantiateRequest.args] - Array of string arguments to pass to the function identified by the fcn value
    * @param {Policy} [chaincodeInstantiateRequest.endorsement-policy] - EndorsementPolicy object for this chaincode (see examples below). If not specified, a default policy of "a signature by any member from any of the organizations corresponding to the array of member service providers" is used. WARNING: The default policy is NOT recommended for production, because this allows an application to bypass the proposal endorsement and send a manually constructed transaction, with arbitrary output in the write set, to the orderer directly. An application's own signature would allow the transaction to be successfully validated and committed to the ledger.
    * @param waitTransactionPeers - The peers to wait on until the chaincode is instantiated
    * @param [waitTransactionPeersTimeout=60000] - A number indicating milliseconds to wait on the response before rejecting the promise with a timeout error. This overrides the default timeout of the Peer instance and the global timeout in the config settings.
    * @returns a promise containing a ProposalResponseObject
    */
    instantiateChaincode(
        channel: Channel,
        chaincodeInstantiateRequest: FcwChaincodeInstantiateUpgradeRequest,
        waitTransactionPeers?: Array<Peer>,
        waitTransactionPeersTimeout: number = 60000
    ): Promise<{
        data: Object, // TODO elaborate
        wait: Function,
    }> {
        return this.mainUserClient.instantiateChaincode(
            channel,
            chaincodeInstantiateRequest,
            waitTransactionPeers,
            waitTransactionPeersTimeout
        )
    }

    /**
    * Sends a chaincode upgrade proposal to one or more endorsing peers. A chaincode must be instantiated on a channel-by-channel basis before it can be used. The chaincode must first be installed on the endorsing peers where this chaincode is expected to run
    * @param channel - The channel to use
    * @param chaincodeUpgradeRequest - The chaincode upgrade request to be made
    * @param {Array<Peer>} [chaincodeUpgradeRequest.targets] - An array of Peer objects that are used to satisfy the instantiation policy. Defaults to channel peers if not specified
    * @param {Policy} [chaincodeUpgradeRequest.targetsPolicy] - A policy used to select peers from the channel if targets is not specified
    * @param {string} chaincodeUpgradeRequest.chaincodeId - Name of the chaincode
    * @param {string} chaincodeUpgradeRequest.chaincodeVersion - Version string of the chaincode, such as 'v1'
    * @param {string} [chaincodeUpgradeRequest.chaincodeType] -  Type of chaincode. One of 'golang', 'car' or 'java'. Default is 'golang'. Note that 'java' is not supported as of v1.0.
    * @param {Map} [chaincodeUpgradeRequest.transientMap] - Map that can be used by the chaincode during intialization, but not saved in the ledger. Data such as cryptographic information for encryption can be passed to the chaincode using this technique
    * @param {string} [chaincodeUpgradeRequest.fcn] - The function name to be returned when calling stub.GetFunctionAndParameters() in the target chaincode. Default is 'init'
    * @param {string[]} [chaincodeUpgradeRequest.args] - Array of string arguments to pass to the function identified by the fcn value
    * @param {Policy} [chaincodeUpgradeRequest.endorsement-policy] - EndorsementPolicy object for this chaincode (see examples below). If not specified, a default policy of "a signature by any member from any of the organizations corresponding to the array of member service providers" is used. WARNING: The default policy is NOT recommended for production, because this allows an application to bypass the proposal endorsement and send a manually constructed transaction, with arbitrary output in the write set, to the orderer directly. An application's own signature would allow the transaction to be successfully validated and committed to the ledger.
    * @param waitTransactionPeers - The peers to wait on until the chaincode is instantiated
    * @param [waitTransactionPeersTimeout=60000] - A number indicating milliseconds to wait on the response before rejecting the promise with a timeout error. This overrides the default timeout of the Peer instance and the global timeout in the config settings.
    * @returns  a promise containing a ProposalResponseObject
    */
    upgradeChaincode(
        channel: Channel,
        chaincodeUpgradeRequest: FcwChaincodeInstantiateUpgradeRequest,
        waitTransactionPeers?: Array<Peer>,
        waitTransactionPeersTimeout: number = 60000
    ): Promise<{
        data: Object,
        wait: Function,
    }> {
        return this.mainUserClient.upgradeChaincode(
            channel,
            chaincodeUpgradeRequest,
            waitTransactionPeers,
            waitTransactionPeersTimeout
        )
    }

    /**
        * Sends a Transaction Proposal to peers in a channel
        * @param channel - The channel object to use
        * @param chaincodeId - The id of the channel
        * @param [targets] - The peers to use for the transaction proposal, falls back to the peers in the channel if unspecified
        * @param [opts] - The options for the transaction proposal
        * @param {string} [opts.fcn] - The function to be called on the chaincode, defaults to 'invoke'
        * @param {Array<string>} [opts.args] - The arguments to suppied to the chaincode function
        * @param {string} [opts.transientMap] - Map that can be used by the chaincode during intialization, but not saved in the ledger. Data such as cryptographic information for encryption can be passed to the chaincode using this technique
        * @returns A promise containing the transaction ID and transaction request objects
        */
    async sendTransactionProposal(
        channel: Channel,
        chaincodeId: string,
        targets?: Array<Peer>,
        opts?: TransactionProposalOpts = {}
    ): Promise<{
        data: {
            txId: TransactionID,
            transactionRequest: TransactionRequest,
        },
    }> {
        return this.mainUserClient.sendTransactionProposal(channel, chaincodeId, targets, opts)
    }

    /**
        * Sends a Transaction to peers in a channel
        * @param channel - The channel object to use
        * @param transactionId - The transaction ID to wait on
        * @param transactionRequest - An object containing the proposal responses from the peers and the proposal
        * @param [timeout=60000] - The maximum amount of time to wait for the transaction
        * @returns A promise containing the response to the transaction
        */
    async sendTransaction(
        channel: Channel,
        transactionId: string,
        transactionRequest: TransactionRequest,
        timeout: number = 60000
    ): Promise<{
        data: {
            status: string,
        },
        wait: Function,
    }> {
        return this.mainUserClient.sendTransaction(channel, transactionId, transactionRequest, timeout)
    }

    /**
        * Sends a Transaction Proposal to peers in a channel and formats the response
        * @param channel - The channel object to use
        * @param chaincodeId - The id of the channel
        * @param [targets] - The peers to use for the transaction proposal, falls back to the peers in the channel if unspecified
        * @param [opts] - The options for the transaction proposal
        * @param {string} [opts.fcn] - The function to be called on the chaincode, defaults to 'invoke'
        * @param {Array<string>} [opts.args] - The arguments to suppied to the chaincode function
        * @param {string} [opts.transientMap] - Map that can be used by the chaincode during intialization, but not saved in the ledger. Data such as cryptographic information for encryption can be passed to the chaincode using this technique
        * @returns A formatted proposal response from a single peer
        */
    queryChaincode(
        channel: Channel,
        chaincodeId: string,
        targets?: Array<Peer>,
        opts?: TransactionProposalOpts
    ): Promise<{
        data: { status: number, message: string, payload: string },
    }> {
        return this.mainUserClient.queryChaincode(channel, chaincodeId, targets, opts)
    }

    /**
        * Sends a Transaction Proposal to peers in a channel and formats the response
        * @param channel - The channel object to use
        * @param chaincodeId - The id of the channel
        * @param [targets] - The peers to use for the transaction proposal, falls back to the peers in the channel if unspecified
        * @param [opts] - The options for the transaction proposal
        * @param {string} [opts.fcn] - The function to be called on the chaincode, defaults to 'invoke'
        * @param {Array<string>} [opts.args] - The arguments to suppied to the chaincode function
        * @param {string} [opts.transientMap] - Map that can be used by the chaincode during intialization, but not saved in the ledger. Data such as cryptographic information for encryption can be passed to the chaincode using this technique
        * @param [sendTransactionTimeout] - The maximum amount of time to wait for the transaction
        * @returns An object holding the transaction response, transaction proposal response, and transaction ID
        */
    async invokeChaincode(
        channel: Channel,
        chaincodeId: string,
        targets?: Array<Peer>,
        opts?: TransactionProposalOpts,
        sendTransactionTimeout?: number
    ): Promise<{
        data: {
            transactionResponse: { status: string },
            proposalResponse: {
                status: number,
                message: string,
                payload: string,
            },
            transactionId: string,
        },
        wait: Function,
    }> {
        return this.mainUserClient.invokeChaincode(channel, chaincodeId, targets, opts, sendTransactionTimeout)
    }
}

export function isMultiUserClient(obj: any) {
    return obj.bindChannel && !obj.getOrganizationConfig
}