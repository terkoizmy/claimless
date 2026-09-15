// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/// @title AgentIdentity
/// @notice Adapter into the canonical ERC-8004 registries (Identity + Reputation).
///         Claimless does NOT fork ERC-8004: agents are registered in the upstream
///         IdentityRegistry and risk summaries are pushed into the upstream
///         ReputationRegistry via `giveFeedback`, under a fixed Claimless taxonomy
///         tag (`TAG1_INCIDENT`) so external consumers can filter them.
///
///         Registry addresses are constructor args so the same deployment recipe
///         works on any network (Monad testnet 10143 and Monad mainnet 143 both
///         carry the canonical registries). Nothing is hardcoded here.
///
///         Design rules (PLAN.md §3):
///         - Never rate our own agent: ERC-8004's canonical registry blocks
///           self-feedback, so we enforce it upstream of the call as well.
///         - Push a summary, not raw events; rich data stays in IncidentRegistry.
contract AgentIdentity {
    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    error NotOwner();
    error NotAgentOwner();
    error AgentNotRegistered();
    error EmptyClients();

    // ------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------

    /// @notice Fixed primary taxonomy tag written on every risk summary, so
    ///         ReputationRegistry consumers can filter Claimless feedback.
    string public constant TAG1_INCIDENT = "claimless:incident";

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    /// @notice Canonical ERC-8004 IdentityRegistry (deployed deterministically).
    IIdentityRegistry public immutable identityRegistry;
    /// @notice Canonical ERC-8004 ReputationRegistry (same upstream deployment).
    IReputationRegistry public immutable reputationRegistry;

    /// @notice Admin: may publish risk summaries, set the client list, and
    ///         transfer admin rights.
    address public owner;

    /// @notice agentId => owner (the address that registered the agent here).
    mapping(uint256 agentId => address owner) private _agentOwner;
    /// @notice owner => agentId registered through this adapter.
    mapping(address owner => uint256 agentId) public agentOf;

    /// @notice Client (feedback reporter) address list used for
    ///         `ReputationRegistry.getSummary`, which requires a non-empty
    ///         array. Defaults to `[address(this)]`; owner may replace it.
    address[] private _clients;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string agentURI);
    event SummaryPublished(uint256 indexed agentId, int128 score, uint8 decimals, string tag1);
    event ClientsUpdated(address[] clients);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------

    /// @param identityRegistry_ Canonical ERC-8004 IdentityRegistry.
    ///        Monad testnet: 0x8004A818BFB912233c491871b3d84c89A494BD9e.
    /// @param reputationRegistry_ Canonical ERC-8004 ReputationRegistry.
    ///        Monad testnet: 0x8004B663056A597Dffe9eCcC1965A193B7388713.
    constructor(IIdentityRegistry identityRegistry_, IReputationRegistry reputationRegistry_) {
        identityRegistry = identityRegistry_;
        reputationRegistry = reputationRegistry_;
        owner = msg.sender;

        // Default client list: this adapter itself. Non-empty, as the canonical
        // registry requires for `getSummary`.
        _clients.push(address(this));
    }

    // ------------------------------------------------------------------
    // Registration
    // ------------------------------------------------------------------

    /// @notice Register a new agent in the canonical IdentityRegistry.
    /// @dev The canonical registry mints to `msg.sender`, which here is this
    ///      adapter. We immediately forward the NFT to the calling operator,
    ///      for two reasons: the human owns their identity, and ERC-8004 blocks
    ///      self-feedback, so an adapter that kept ownership could never publish
    ///      a risk summary for the agent it registered.
    /// @param agentURI URI of the agent's registration file (ERC-8004 format).
    /// @return agentId The ERC-8004 token id minted by the canonical registry.
    function registerAgent(string calldata agentURI) external returns (uint256 agentId) {
        agentId = identityRegistry.register(agentURI);
        // Hand the identity to the operator. Adapter owns it only between these
        // two calls.
        identityRegistry.safeTransferFrom(address(this), msg.sender, agentId);

        _agentOwner[agentId] = msg.sender;
        agentOf[msg.sender] = agentId;
        emit AgentRegistered(agentId, msg.sender, agentURI);
    }

    /// @notice Owner of an agent registered through this adapter (0 if unknown).
    function ownerOfAgent(uint256 agentId) external view returns (address) {
        return _agentOwner[agentId];
    }

    // ------------------------------------------------------------------
    // Risk summary publishing
    // ------------------------------------------------------------------

    /// @notice Publish a Claimless risk summary into the canonical
    ///         ReputationRegistry. Owner-only: this adapter is the trusted
    ///         underwriter feed (IncidentRegistry -> RiskScore -> here).
    /// @param agentId Target ERC-8004 agent id.
    /// @param score Signed fixed-point risk value, scale given by `decimals`.
    /// @param decimals Decimals of `score` (0-18).
    /// @param tag1 Primary taxonomy tag (keep `TAG1_INCIDENT` for comparability).
    /// @param tag2 Free-form secondary tag (e.g. "SLA_BREACH").
    function publishRiskSummary(
        uint256 agentId,
        int128 score,
        uint8 decimals,
        string calldata tag1,
        string calldata tag2
    ) external onlyOwner {
        // The canonical registry blocks self-feedback; the caller here is the
        // client address recorded by the registry, so a call made through this
        // adapter about an agent it owns would revert downstream. Guard early.
        if (identityRegistry.ownerOf(agentId) == address(this)) revert NotAgentOwner();

        reputationRegistry.giveFeedback(
            agentId, score, decimals, tag1, tag2, "", "", bytes32(0)
        );
        emit SummaryPublished(agentId, score, decimals, tag1);
    }

    // ------------------------------------------------------------------
    // Reads
    // ------------------------------------------------------------------

    /// @notice Aggregate risk summary for an agent, read from the canonical
    ///         ReputationRegistry filtered on the given taxonomy tags.
    /// @return count Number of (non-revoked) feedback entries by the tracked clients.
    /// @return summaryValue Signed fixed-point aggregate.
    /// @return summaryValueDecimals Scale of `summaryValue`.
    function getAgentRisk(uint256 agentId, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        return reputationRegistry.getSummary(agentId, _clients, tag1, tag2);
    }

    /// @notice Aggregated risk under the default Claimless taxonomy
    ///         (`tag1 = TAG1_INCIDENT`, `tag2 = ""`).
    function getAgentRisk(uint256 agentId)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        return this.getAgentRisk(agentId, TAG1_INCIDENT, "");
    }

    /// @notice Canonical ERC-721 owner of an agent id (on-chain source of truth).
    function getAgentOwner(uint256 agentId) external view returns (address) {
        return identityRegistry.ownerOf(agentId);
    }

    /// @notice Agent wallet recorded in the canonical IdentityRegistry.
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return identityRegistry.getAgentWallet(agentId);
    }

    /// @notice Current client list used for `getSummary` aggregations.
    function clients() external view returns (address[] memory) {
        return _clients;
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    /// @notice Replace the client (feedback reporter) list used for
    ///         `ReputationRegistry.getSummary`. The canonical registry requires
    ///         a non-empty array, so an empty input reverts.
    function setClients(address[] calldata newClients) external onlyOwner {
        if (newClients.length == 0) revert EmptyClients();
        delete _clients;
        for (uint256 i; i < newClients.length; ++i) {
            _clients.push(newClients[i]);
        }
        emit ClientsUpdated(newClients);
    }

    /// @notice Transfer admin rights.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert NotOwner();
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }
}