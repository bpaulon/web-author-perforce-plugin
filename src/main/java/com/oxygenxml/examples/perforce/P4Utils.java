package com.oxygenxml.examples.perforce;

import java.util.List;

import com.perforce.p4java.client.IClient;
import com.perforce.p4java.core.ChangelistStatus;
import com.perforce.p4java.core.IChangelistSummary;
import com.perforce.p4java.core.file.FileAction;
import com.perforce.p4java.core.file.FileSpecBuilder;
import com.perforce.p4java.core.file.IFileSpec;
import com.perforce.p4java.exception.AccessException;
import com.perforce.p4java.exception.ConnectionException;
import com.perforce.p4java.exception.RequestException;
import com.perforce.p4java.server.IOptionsServer;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class P4Utils {

	/**
	 * Check whether a file exists in perforce and is NOT deleted in the
	 * head-revision (requires an initialized server)
	 * 
	 * @param f
	 *            File (p4 depot path) to be checked
	 * @return true if file exists and is not deleted, otherwise false.
	 */
	public static boolean p4FileExists(IOptionsServer server, String f) {

		try {
			List<IFileSpec> depotFiles = server.getDepotFiles(FileSpecBuilder.makeFileSpecList(f), false);
			if (depotFiles.isEmpty() || (depotFiles.get(0) == null) || (depotFiles.get(0).getAction() == null)
					|| (depotFiles.get(0).getAction() == FileAction.DELETE)) {
				return false;
			}
		} catch (ConnectionException e) {
			log.error("Can't connect perforce-server", e);
			return false;
		} catch (AccessException e) {
			log.error("Can't access perforce-server", e);
			return false;
		}

		return true;
	}

	public static void deleteClient(IOptionsServer server, IClient client) {
		log.debug("Deleting temporary perforce client {} ", client.getName());

		// revert open files if any
		try {
			client.revertFiles(FileSpecBuilder.makeFileSpecList("//..."), false, 0, false, true);
		} catch (ConnectionException e) {
			log.warn("Perforce connection problem while reverting files of client {}", client.getName());
			log.warn("Please cleanup yourself.");
		} catch (AccessException e) {
			log.warn("Perforce access problem while reverting files of client {} ", client.getName());
			log.warn("Please cleanup yourself.");
		}

		// Remove any pending changes.
		// This can happen if nothing was submitted because
		// the target-files exist already in perforce and "overwrite" is set to
		// "false".
		try {
			List<IChangelistSummary> pending = server.getChangelists(1000, // restrict
																			// to
																			// the
																			// last
																			// 1000
																			// changes
					null, // don't restrict to any path
					client.getName(), // restrict to changes for our client
					client.getOwnerName(), // restrict to owner of client
					false, // includeIntegrated = false
					false, // longdescs = false
					false, // don't restrict to submitted changelists
					true // restrict to pending changelists
			);
			if (pending != null) {
				for (IChangelistSummary c : pending) {
					if (c != null) {
						if (c.getStatus() == ChangelistStatus.PENDING) {
							server.deletePendingChangelist(c.getId());
							log.debug("Deleted pending changelist {}", c.getId());
						} else {
							log.warn("Something impossible happened while deleting pending changelists. "
									+ "(change {}, status {})", c.getId(), c.getStatus());
						}
					}
				}
			} else {
				log.debug("No pending changelists");
			}
    } catch (ConnectionException | RequestException | AccessException e) {
      log.error("Error while deleting pending changes", e);
    }

		// delete client
		try {
			server.deleteClient(client.getName(), false);
			log.debug("Deleted client {}", client.getName());
		} catch (ConnectionException | RequestException | AccessException e) {
			log.error("Error deleting client {}", client.getName(), e);
		}
	}
}
