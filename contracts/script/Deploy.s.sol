// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IncidentRegistry} from "../src/IncidentRegistry.sol";
import {RiskScore} from "../src/RiskScore.sol";
import {AgentIdentity} from "../src/AgentIdentity.sol";
import {CoverPool} from "../src/CoverPool.sol";
import {ParametricTrigger} from "../src/ParametricTrigger.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../src/interfaces/IReputationRegistry.sol";

/// @title Deploy — Monad testnet (chain 10143)
/// @notice Deploys the Claimless core contracts and writes their addresses to
///         `deployments/monad-testnet.json` (fs_permissions in foundry.toml).
///
/// Usage:
///   set "PATH=%PATH%;C:\Users\terkoiz\.foundry\bin"
///   cd contracts
///   forge script script/Deploy.s.sol --rpc-url %MONAD_RPC_URL% --broadcast -vv
///
/// Requires MONAD_PRIVATE_KEY and MONAD_RPC_URL in the environment (.env).
/// The ERC-8004 registries are canonical and already deployed; we only pass
/// their addresses in. We do NOT deploy or fork them.
contract Deploy is Script {
    // Canonical ERC-8004 addresses. Deterministic across chains by network class.
    address constant ERC8004_IDENTITY_TESTNET = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant ERC8004_REPUTATION_TESTNET = 0x8004B663056A597Dffe9eCcC1965A193B7388713;

    // Monad testnet chain id.
    uint256 constant MONAD_TESTNET_CHAIN_ID = 10143;

    /// @dev Chainlink KeystoneForwarder on Monad testnet, from
    ///      `cre workflow supported-chains`. ParametricTrigger accepts reports
    ///      only from this address.
    address constant CRE_FORWARDER = 0xF8344CFd5c43616a4366C34E3EEE75af79a74482;

    function run() external {
        require(block.chainid == MONAD_TESTNET_CHAIN_ID, "Deploy: not Monad testnet");

        // Fail loudly if the canonical registries are missing (testnet resets
        // can redeploy canonical contracts; we must notice).
        _requireCode(ERC8004_IDENTITY_TESTNET, "ERC-8004 IdentityRegistry");
        _requireCode(ERC8004_REPUTATION_TESTNET, "ERC-8004 ReputationRegistry");

        uint256 pk = vm.envUint("MONAD_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console.log("Deployer:", deployer);

        vm.startBroadcast(pk);

        // IncidentRegistry(resolver, minStake): resolver = address(0) makes
        // challenge resolution permissionless, which is what we want on testnet.
        IncidentRegistry registry = new IncidentRegistry(address(0), 0.01 ether);
        RiskScore risk = new RiskScore(address(registry));
        AgentIdentity identity = new AgentIdentity(
            IIdentityRegistry(ERC8004_IDENTITY_TESTNET),
            IReputationRegistry(ERC8004_REPUTATION_TESTNET)
        );
        // CoverPool needs the registry (to test for a disclosed record) and the
        // score (to price risk).
        CoverPool pool = new CoverPool(address(registry), address(risk));
        // ParametricTrigger needs the pool (to pay out), the score (to evaluate),
        // the registry (disclosure gate), and the forwarder (report signer).
        ParametricTrigger trigger =
            new ParametricTrigger(address(pool), address(risk), address(registry), CRE_FORWARDER);

        vm.stopBroadcast();

        console.log("IncidentRegistry:", address(registry));
        console.log("RiskScore:", address(risk));
        console.log("AgentIdentity:", address(identity));
        console.log("CoverPool:", address(pool));
        console.log("ParametricTrigger:", address(trigger));

        _writeDeployment(
            address(registry), address(risk), address(identity), address(pool), address(trigger), deployer
        );
    }

    function _requireCode(address target, string memory label) internal view {
        require(target.code.length > 0, string.concat("missing bytecode: ", label));
    }

    function _writeDeployment(
        address registry,
        address risk,
        address identity,
        address pool,
        address trigger,
        address deployer
    ) internal {
        string memory json = string.concat(
            "{\n",
            '  "chainId": 10143,\n',
            '  "network": "monad-testnet",\n',
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "erc8004": {\n',
            '    "identityRegistry": "', vm.toString(ERC8004_IDENTITY_TESTNET), '",\n',
            '    "reputationRegistry": "', vm.toString(ERC8004_REPUTATION_TESTNET), '"\n',
            "  },\n",
            '  "cre": {\n',
            '    "forwarder": "', vm.toString(CRE_FORWARDER), '",\n',
            '    "chainSelector": "2183018362218727504"\n',
            "  },\n",
            '  "contracts": {\n',
            '    "incidentRegistry": "', vm.toString(registry), '",\n',
            '    "riskScore": "', vm.toString(risk), '",\n',
            '    "agentIdentity": "', vm.toString(identity), '",\n',
            '    "coverPool": "', vm.toString(pool), '",\n',
            '    "parametricTrigger": "', vm.toString(trigger), '"\n',
            "  }\n",
            "}\n"
        );
        vm.writeFile("deployments/monad-testnet.json", json);
        console.log("Wrote deployments/monad-testnet.json");
    }
}
