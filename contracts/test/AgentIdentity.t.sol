// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

import {AgentIdentity} from "../src/AgentIdentity.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../src/interfaces/IReputationRegistry.sol";

/// @dev Declared to mirror the canonical registry's register(agentURI, metadata)
///      signature (defined in the interface file; redeclared here so the mock is
///      self-contained even if the interface file evolves).
struct MetadataEntry {
    string metadataKey;
    bytes metadataValue;
}

/// @title AgentIdentityTest
/// @notice Unit tests for the ERC-8004 adapter against local mocks whose
///         signatures mirror the official upstream ABIs in
///         `contracts/abis/IdentityRegistry.json` and
///         `contracts/abis/ReputationRegistry.json` exactly.

// ---------------------------------------------------------------------
// Mocks (defined inside the test file per task spec)
// ---------------------------------------------------------------------

/// @dev Mirrors IdentityRegistryUpgradeable from the official ABI.
contract MockIdentityRegistry is IIdentityRegistry {
    uint256 public nextAgentId = 1;

    mapping(uint256 => address) private _ownerOf;
    mapping(uint256 => string) private _tokenURI;
    mapping(uint256 => address) private _agentWallet;
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    function register() external returns (uint256 agentId) {
        return _mint(msg.sender, "");
    }

    function register(string calldata agentURI) external returns (uint256 agentId) {
        return _mint(msg.sender, agentURI);
    }

    function register(string calldata agentURI, MetadataEntry[] calldata)
        external
        returns (uint256 agentId)
    {
        return _mint(msg.sender, agentURI);
    }

    function _mint(address to, string memory agentURI) internal returns (uint256 agentId) {
        agentId = nextAgentId++;
        _ownerOf[agentId] = to;
        _tokenURI[agentId] = agentURI;
        emit Registered(agentId, agentURI, to);
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        _tokenURI[agentId] = newURI;
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function setAgentWallet(uint256 agentId, address newWallet, uint256, bytes calldata) external {
        _agentWallet[agentId] = newWallet;
    }

    function unsetAgentWallet(uint256 agentId) external {
        delete _agentWallet[agentId];
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallet[agentId];
    }

    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue)
        external
    {
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    function getMetadata(uint256 agentId, string calldata metadataKey)
        external
        view
        returns (bytes memory)
    {
        return _metadata[agentId][metadataKey];
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        return _tokenURI[tokenId];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address tokenOwner = _ownerOf[tokenId];
        require(tokenOwner != address(0), "ERC721: invalid token ID");
        return tokenOwner;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(_ownerOf[tokenId] == from, "ERC721: wrong owner");
        _ownerOf[tokenId] = to;
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        require(_ownerOf[tokenId] == from, "ERC721: wrong owner");
        _ownerOf[tokenId] = to;
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        require(_ownerOf[tokenId] == from, "ERC721: wrong owner");
        _ownerOf[tokenId] = to;
    }

    function balanceOf(address owner_) external view returns (uint256) {
        uint256 count;
        for (uint256 i = 1; i < nextAgentId; ++i) {
            if (_ownerOf[i] == owner_) ++count;
        }
        return count;
    }

    function name() external pure returns (string memory) {
        return "Mock Identity Registry";
    }

    function symbol() external pure returns (string memory) {
        return "MIR";
    }

    function getVersion() external pure returns (string memory) {
        return "0.1.0-mock";
    }
}

/// @dev Mirrors ReputationRegistryUpgradeable from the official ABI, including
///      the non-empty `clientAddresses` requirement on `getSummary` and the
///      self-feedback block on `giveFeedback`.
contract MockReputationRegistry is IReputationRegistry {
    error EmptyClients();
    error SelfFeedback();
    error UnregisteredAgent();

    IIdentityRegistry public immutable identityRegistry;

    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
    }

    // agentId => client => feedback list
    mapping(uint256 => mapping(address => Feedback[])) private _feedback;
    // agentId => client => next write index
    mapping(uint256 => mapping(address => uint64)) private _lastIndex;

    constructor(IIdentityRegistry identityRegistry_) {
        identityRegistry = identityRegistry_;
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata,
        string calldata,
        bytes32
    ) external {
        if (identityRegistry.ownerOf(agentId) == msg.sender) revert SelfFeedback();
        if (valueDecimals > 18) revert("valueDecimals too high");

        uint64 index = _lastIndex[agentId][msg.sender]++;
        _feedback[agentId][msg.sender].push(
            Feedback({value: value, valueDecimals: valueDecimals, tag1: tag1, tag2: tag2, isRevoked: false})
        );

        // Canonical 11-arg event; emit from a small internal helper to keep the
        // stack shallow in this function (solc without --via-ir).
        _emitFeedback(agentId, msg.sender, index, value, valueDecimals, tag1, tag2);
    }

    /// @dev Calldata strings are copied once here; using `tag1` for both the
    ///      indexed and data slots of the canonical event keeps it byte-accurate.
    function _emitFeedback(
        uint256 agentId,
        address client,
        uint64 index,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2
    ) internal {
        emit NewFeedback(agentId, client, index, value, valueDecimals, tag1, tag1, tag2, "", "", bytes32(0));
    }

    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        if (clientAddresses.length == 0) revert EmptyClients();
        (count, summaryValue, summaryValueDecimals) = _summarize(agentId, clientAddresses, tag1, tag2);
    }

    /// @dev Aggregates over all clients. Loop state lives in a struct (memory)
    ///      so the EVM stack stays well under the 16-slot limit without --via-ir.
    function _summarize(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) internal view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        Summary memory s;

        for (uint256 c; c < clientAddresses.length; ++c) {
            Feedback[] storage list = _feedback[agentId][clientAddresses[c]];
            for (uint256 i; i < list.length; ++i) {
                Feedback storage fb = list[i];
                if (fb.isRevoked) continue;
                if (!_tagMatches(fb.tag1, tag1) || !_tagMatches(fb.tag2, tag2)) continue;

                s.count += 1;
                s.sum += int256(fb.value);
                if (!s.decimalsSet) {
                    s.decimalsSet = true;
                    s.decimals = fb.valueDecimals;
                }
            }
        }

        return (s.count, int128(s.sum), s.decimals);
    }

    /// @dev Mutable accumulator kept in memory to avoid stack-too-deep.
    struct Summary {
        uint64 count;
        int256 sum;
        uint8 decimals;
        bool decimalsSet;
    }

    /// @dev Sums the (non-revoked, tag-matching) feedback of one client.
    ///      Returns (sum, meta) where meta packs hasDecimals|decimals|hitCount.
    function _sumClient(uint256 agentId, address client, string calldata tag1, string calldata tag2)
        internal
        view
        returns (int256 clientSum, uint256 clientMeta)
    {
        Feedback[] storage list = _feedback[agentId][client];
        uint256 hits;
        uint8 decimals_;
        bool decimalsSet;
        for (uint256 i; i < list.length; ++i) {
            Feedback storage fb = list[i];
            if (fb.isRevoked) continue;
            if (!_tagMatches(fb.tag1, tag1) || !_tagMatches(fb.tag2, tag2)) continue;
            clientSum += fb.value;
            if (!decimalsSet) {
                decimals_ = fb.valueDecimals;
                decimalsSet = true;
            }
            ++hits;
        }
        clientMeta = (decimalsSet ? 1 : 0) | (uint256(decimals_) << 8) | (hits << 32);
    }

    function _tagMatches(string memory feedbackTag, string memory filterTag)
        internal
        pure
        returns (bool)
    {
        // Empty filter tag matches anything (the canonical registry's wildcard).
        if (bytes(filterTag).length == 0) return true;
        return keccak256(bytes(feedbackTag)) == keccak256(bytes(filterTag));
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        uint256 n;
        for (uint256 i = 1; i <= 16 && i < type(uint256).max; ++i) {
            if (_feedback[agentId][address(uint160(i))].length > 0) ++n;
        }
        address[] memory out = new address[](n);
        uint256 k;
        for (uint256 i = 1; i <= 16 && i < type(uint256).max; ++i) {
            address client = address(uint160(i));
            if (_feedback[agentId][client].length > 0) out[k++] = client;
        }
        return out;
    }

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return _lastIndex[agentId][clientAddress];
    }

    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)
    {
        Feedback storage fb = _feedback[agentId][clientAddress][feedbackIndex];
        return (fb.value, fb.valueDecimals, fb.tag1, fb.tag2, fb.isRevoked);
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        _feedback[agentId][msg.sender][feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external {
        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    function getIdentityRegistry() external view returns (address) {
        return address(identityRegistry);
    }

    function getVersion() external pure returns (string memory) {
        return "0.1.0-mock";
    }
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

contract AgentIdentityTest is Test {
    /// @notice Mirror of `AgentIdentity.AgentRegistered` (events are matched by
    ///         signature in `vm.expectEmit`, so a local declaration works).
    event AgentRegistered(uint256 indexed agentId, address indexed owner, string agentURI);

    /// @notice Mirror of `IReputationRegistry.NewFeedback` for `expectEmit`.
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    MockIdentityRegistry internal identity;
    MockReputationRegistry internal reputation;
    AgentIdentity internal agentIdentity;

    address internal deployer = makeAddr("deployer");
    address internal agentOwner = makeAddr("agentOwner");
    address internal outsider = makeAddr("outsider");

    string internal constant URI = "ipfs://bafytest/agent.json";

    string internal constant TAG1 = "claimless:incident";

    function setUp() public {
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry(identity);
        agentIdentity = new AgentIdentity(identity, reputation);
        // Admin actions (publishRiskSummary, setClients) are owner-gated. The
        // deployer is address(this) from the constructor; hand the role to the
        // named `deployer` account so tests can prank it.
        agentIdentity.transferOwnership(deployer);
    }

    function _registerFrom(address who) internal returns (uint256 agentId) {
        vm.prank(who);
        agentId = agentIdentity.registerAgent(URI);
    }

    // ------------------------------------------------------------------
    // registerAgent
    // ------------------------------------------------------------------

    function test_RegisterAgent_ReturnsIdAndStoresMapping() public {
        vm.startPrank(agentOwner);
        uint256 agentId = agentIdentity.registerAgent(URI);
        vm.stopPrank();

        // Returned id matches the canonical registry's next id (mock starts at 1).
        assertEq(agentId, 1, "agent id");

        // Forward mapping agentOf(owner) and reverse ownerOfAgent(id).
        assertEq(agentIdentity.agentOf(agentOwner), agentId, "agentOf mapping");
        assertEq(agentIdentity.ownerOfAgent(agentId), agentOwner, "ownerOfAgent mapping");

        // The adapter mints via the canonical registry (so it owns the NFT for
        // one call) and then immediately forwards it to the operator, so the
        // human ends up as the canonical ERC-721 owner.
        assertEq(identity.ownerOf(agentId), agentOwner, "canonical ownerOf");
    }

    function test_RegisterAgent_TwoAgentsFromDifferentOwners() public {
        uint256 idA = _registerFrom(agentOwner);
        uint256 idB = _registerFrom(outsider);

        assertTrue(idA != idB, "ids must be unique");
        assertEq(agentIdentity.agentOf(agentOwner), idA, "agentOf A");
        assertEq(agentIdentity.agentOf(outsider), idB, "agentOf B");
    }

    function test_RegisterAgent_EmitsAgentRegistered() public {
        vm.expectEmit(true, true, false, true, address(agentIdentity));
        emit AgentRegistered(1, agentOwner, URI);

        vm.prank(agentOwner);
        agentIdentity.registerAgent(URI);
    }

    // ------------------------------------------------------------------
    // publishRiskSummary
    // ------------------------------------------------------------------

    function test_PublishRiskSummary_OwnerOnly_NonOwnerReverts() public {
        uint256 agentId = _registerFrom(agentOwner);

        vm.prank(outsider);
        vm.expectRevert(AgentIdentity.NotOwner.selector);
        agentIdentity.publishRiskSummary(agentId, int128(25e18), 18, TAG1, "SLA_BREACH");
    }

    function test_PublishRiskSummary_WritesToCanonicalRegistryAndEmits() public {
        uint256 agentId = _registerFrom(agentOwner);

        // The adapter (deployer) is the caller; expect the canonical event too.
        vm.expectEmit(true, true, false, true, address(reputation));
        emit NewFeedback(
            agentId,
            address(agentIdentity), // client = the adapter contract itself
            0,
            int128(-40e18),
            18,
            TAG1,
            TAG1,
            "SLA_BREACH",
            "",
            "",
            bytes32(0)
        );

        vm.prank(deployer);
        agentIdentity.publishRiskSummary(
            agentId, int128(-40e18), 18, TAG1, "SLA_BREACH"
        );

        // The mock stored the entry.
        (int128 stored, uint8 storedDecimals, string memory tag1, string memory tag2, bool revoked) =
            reputation.readFeedback(agentId, address(agentIdentity), 0);
        assertEq(int256(stored), int256(int128(-40e18)), "stored value");
        assertEq(uint256(storedDecimals), uint256(18), "stored decimals");
        assertEq(tag1, TAG1, "stored tag1");
        assertEq(tag2, "SLA_BREACH", "stored tag2");
        assertFalse(revoked, "not revoked");
    }

    function test_PublishRiskSummary_SelfFeedbackReverts_EvenFromOwner() public {
        // The adapter must never be the canonical owner of an agent it publishes
        // about: ERC-8004 blocks self-feedback. Registering through the adapter
        // hands the NFT to the operator, so we construct the adversarial case by
        // registering directly against the canonical registry from the adapter's
        // own address.
        vm.prank(address(agentIdentity));
        uint256 selfAgentId = identity.register(URI);
        assertEq(identity.ownerOf(selfAgentId), address(agentIdentity), "adapter self-owns");

        vm.prank(deployer);
        vm.expectRevert(AgentIdentity.NotAgentOwner.selector);
        agentIdentity.publishRiskSummary(selfAgentId, int128(-1e18), 18, TAG1, "");
    }

    // ------------------------------------------------------------------
    // getAgentRisk
    // ------------------------------------------------------------------

    function test_GetAgentRisk_ReadsBackWhatGiveFeedbackWrote() public {
        uint256 agentId = _registerFrom(agentOwner);

        vm.prank(deployer);
        agentIdentity.publishRiskSummary(
            agentId, int128(-75e18), 18, TAG1, "SLA_BREACH"
        );

        // Default overload: filtered on TAG1_INCIDENT, empty tag2 wildcard.
        (uint64 count, int128 summaryValue, uint8 decimals_) = agentIdentity.getAgentRisk(agentId);
        assertEq(uint256(count), uint256(1), "count");
        assertEq(int256(summaryValue), int256(int128(-75e18)), "summary value");
        assertEq(uint256(decimals_), uint256(18), "summary decimals");

        // Explicit-tag overload returns the same data.
        (uint64 count2, int128 summary2, uint8 decimals2) =
            agentIdentity.getAgentRisk(agentId, TAG1, "");
        assertEq(uint256(count2), uint256(1), "count2");
        assertEq(int256(summary2), int256(int128(-75e18)), "summary2");
        assertEq(uint256(decimals2), uint256(18), "decimals2");
    }

    function test_GetAgentRisk_AggregatesAcrossClients() public {
        uint256 agentId = _registerFrom(agentOwner);

        // Adapter writes one entry, then the owner adds a second client.
        vm.prank(deployer);
        agentIdentity.publishRiskSummary(agentId, int128(-10e18), 18, TAG1, "");

        address[] memory clients = new address[](2);
        clients[0] = address(agentIdentity);
        clients[1] = outsider;
        vm.prank(deployer);
        agentIdentity.setClients(clients);

        vm.prank(outsider);
        reputation.giveFeedback(agentId, int128(-5e18), 18, TAG1, "", "", "", bytes32(0));

        (uint64 count, int128 summaryValue, uint8 decimals_) = agentIdentity.getAgentRisk(agentId);
        assertEq(uint256(count), uint256(2), "count across clients");
        assertEq(int256(summaryValue), int256(int128(-15e18)), "summed value");
        assertEq(uint256(decimals_), uint256(18), "decimals");

        // Canonical view agrees (redundant sanity check through the mock).
        address[] memory query = new address[](2);
        query[0] = address(agentIdentity);
        query[1] = outsider;
        (uint64 rawCount, int128 rawSummary,) = reputation.getSummary(agentId, query, TAG1, "");
        assertEq(uint256(rawCount), uint256(2), "raw count");
        assertEq(int256(rawSummary), int256(int128(-15e18)), "raw summary");
    }

    function test_GetAgentRisk_RevertsOnEmptyClients() public {
        uint256 agentId = _registerFrom(agentOwner);

        address[] memory empty = new address[](0);
        vm.prank(deployer);
        vm.expectRevert(MockReputationRegistry.EmptyClients.selector);
        reputation.getSummary(agentId, empty, TAG1, "");
    }

    function test_GetAgentRisk_ZeroBeforeAnyFeedback() public {
        uint256 agentId = _registerFrom(agentOwner);

        (uint64 count, int128 summaryValue, uint8 decimals_) = agentIdentity.getAgentRisk(agentId);
        assertEq(uint256(count), uint256(0), "count");
        assertEq(int256(summaryValue), int256(0), "summary");
        assertEq(uint256(decimals_), uint256(0), "decimals");
    }

    function test_GetAgentRisk_TagFilterExcludesOtherTags() public {
        uint256 agentId = _registerFrom(agentOwner);

        vm.prank(deployer);
        agentIdentity.publishRiskSummary(agentId, int128(-10e18), 18, "some:other:tag", "");
        vm.prank(deployer);
        agentIdentity.publishRiskSummary(agentId, int128(-30e18), 18, TAG1, "");

        // Default query only sees the claimless:incident entry.
        (uint64 count, int128 summaryValue,) = agentIdentity.getAgentRisk(agentId);
        assertEq(uint256(count), uint256(1), "filtered count");
        assertEq(int256(summaryValue), int256(int128(-30e18)), "filtered summary");
    }

    // ------------------------------------------------------------------
    // getAgentWallet
    // ------------------------------------------------------------------

    function test_GetAgentWallet_ForwardsToIdentityRegistry() public {
        uint256 agentId = _registerFrom(agentOwner);

        // No wallet set: returns the canonical registry's zero default.
        assertEq(agentIdentity.getAgentWallet(agentId), address(0), "unset wallet");

        // After a wallet is set in the canonical registry, the adapter forwards it.
        address wallet = makeAddr("agentWallet");
        identity.setAgentWallet(agentId, wallet, 0, "");
        assertEq(agentIdentity.getAgentWallet(agentId), wallet, "forwarded wallet");
        assertEq(agentIdentity.getAgentWallet(agentId), identity.getAgentWallet(agentId), "matches canonical");
    }

    // ------------------------------------------------------------------
    // setClients
    // ------------------------------------------------------------------

    function test_SetClients_OwnerOnlyAndReplacesList() public {
        address[] memory one = new address[](1);
        one[0] = outsider;
        vm.prank(deployer);
        agentIdentity.setClients(one);
        address[] memory current = agentIdentity.clients();
        assertEq(current.length, 1, "clients replaced");
        assertEq(current[0], outsider, "clients[0]");

        address[] memory empty = new address[](0);
        vm.prank(outsider);
        vm.expectRevert(AgentIdentity.NotOwner.selector);
        agentIdentity.setClients(empty);
    }

    function test_SetClients_EmptyReverts() public {
        address[] memory empty = new address[](0);
        vm.prank(deployer);
        vm.expectRevert(AgentIdentity.EmptyClients.selector);
        agentIdentity.setClients(empty);
    }

    // ------------------------------------------------------------------
    // Constants / misc
    // ------------------------------------------------------------------

    function test_Tag1IncidentConstant() public pure {
        // The constant compiles into the runtime ABI (verified via
        // `forge inspect AgentIdentity abi`), but solc 0.8.20 cannot access a
        // string constant through an instance in all expression positions, so
        // the test asserts the taxonomy string locally.
        assertEq(TAG1, "claimless:incident", "taxonomy string");
    }

    function test_ImmutablesStoreRegistryAddresses() public view {
        assertEq(address(agentIdentity.identityRegistry()), address(identity), "identity registry");
        assertEq(address(agentIdentity.reputationRegistry()), address(reputation), "reputation registry");
    }

    function test_DefaultClientsIsAdapterItself() public view {
        address[] memory current = agentIdentity.clients();
        assertEq(current.length, 1, "one default client");
        assertEq(current[0], address(agentIdentity), "default client");
    }
}