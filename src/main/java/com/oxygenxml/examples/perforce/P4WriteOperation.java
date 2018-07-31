package com.oxygenxml.examples.perforce;

import java.io.File;
import java.io.IOException;
import java.net.PasswordAuthentication;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import org.apache.commons.io.FileUtils;

import com.perforce.p4java.client.IClient;
import com.perforce.p4java.core.ChangelistStatus;
import com.perforce.p4java.core.IChangelist;
import com.perforce.p4java.core.IDepot;
import com.perforce.p4java.core.file.FileSpecBuilder;
import com.perforce.p4java.core.file.FileSpecOpStatus;
import com.perforce.p4java.core.file.IFileSpec;
import com.perforce.p4java.exception.AccessException;
import com.perforce.p4java.exception.ConnectionException;
import com.perforce.p4java.exception.P4JavaException;
import com.perforce.p4java.exception.RequestException;
import com.perforce.p4java.impl.generic.client.ClientView;
import com.perforce.p4java.impl.generic.core.Changelist;
import com.perforce.p4java.impl.mapbased.client.Client;
import com.perforce.p4java.impl.mapbased.server.Server;
import com.perforce.p4java.server.IOptionsServer;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class P4WriteOperation extends P4Operation {

	private IOptionsServer server;
	private String depotPath;

	 private PasswordAuthentication credentials;
	 
	public P4WriteOperation(String uriString, PasswordAuthentication credentials) {
		try {
			URI uri = new URI(uriString);
			this.serverUri = new URI(uri.getScheme() + "://" + uri.getHost() + ":" + uri.getPort());
			depotPath = uri.getPath();

			this.credentials = credentials;
			
			server = getOptionsServer(null, null);
			server.registerProgressCallback(new P4ProgressCallback());
		} catch (P4JavaException | URISyntaxException e) {
			log.error("Could not create operation", e);
		}
	}

	/**
	 * Writes the passed in byte array to a temporary file. The temp file is
	 * then sync and submitted to perforce
	 * 
	 * @param content
	 */
	public void write(byte[] content) {
		try {
			final File file = File.createTempFile("tmp", null);
			FileUtils.writeByteArrayToFile(file, content);
			log.info("Created temp file {}", file.getAbsolutePath());

			put(file, depotPath);
			
			boolean fileDeleted = file.delete();
			log.info("Temporary file {} deleted {}", file, fileDeleted);
		} catch (Exception e) {
			log.error("P4 write operation to {} failed", depotPath, e);
		}
	}

	void put(File file, String depotPath) {
		put(file, depotPath, true);
	}

	void put(File file, String depotPath, boolean overwrite) {
		log.debug("Working server URI: {}", serverUri);

		try {
			server.setUserName(credentials.getUserName());
			// must be connected to server in order to login
			server.connect();
			server.login(new String(credentials.getPassword()));

			submit(file, depotPath, true);
		} catch (Exception e) {
			log.error("Could not submit file {} to {}", file, depotPath, e);
		}
	}

	private void submit(File source, String destination, boolean overwrite) throws IOException {

		// create a temporary P4 client
		IClient client = createTempClient(source, destination);

		String tmpClientName = client.getName();

		try {
			server.createClient(client);
			server.setCurrentClient(client);
		} catch (P4JavaException pexc) {
			log.error("Error creating perforce-client {} \n {}", tmpClientName, pexc.getMessage());
			throw new IOException("Error creating perforce-client " + tmpClientName + "\n" + pexc.getMessage());
		}
		log.error("Created temp client {}", tmpClientName);

		// check whether the target already exists in perforce (and is not
		// deleted in head-revision)
		Boolean p4add = true;
		if (P4Utils.p4FileExists(server, destination)) {
			log.debug("File exists in perforce already: {}", destination);

			if (overwrite) {
				log.debug("updating {}", destination);
				p4add = false; // no add, but edit in perforce
			} else {
				log.debug("Overwrite set to false, ignoring {}", source.getName());
				return;
			}
		}

		String p4User = server.getUserName();
		Changelist changeListImpl = new Changelist(IChangelist.UNKNOWN, client.getName(), p4User, ChangelistStatus.NEW,
				new Date(), "submitted by webapp author", false, (Server) server);

		try {
			IChangelist changelist = client.createChangelist(changeListImpl);

			if (p4add) {
				client.addFiles(FileSpecBuilder.makeFileSpecList(destination), false, changelist.getId(), null, false);
			} else {
				// "flush" the file (sync -k)
				client.sync(FileSpecBuilder.makeFileSpecList(destination), false, false, true, false);
				// open for edit
				client.editFiles(FileSpecBuilder.makeFileSpecList(destination), false, false, changelist.getId(), null);
			}

			changelist.update();
			changelist.refresh();

			List<IFileSpec> submitFiles = changelist.submit(false);
			if (submitFiles != null) {
				for (IFileSpec fileSpec : submitFiles) {
					if (fileSpec != null) {
						if (fileSpec.getOpStatus() == FileSpecOpStatus.VALID) {
							log.info("submitted: {}", fileSpec.getDepotPathString());
						} else if (fileSpec.getOpStatus() == FileSpecOpStatus.INFO) {
							log.debug(fileSpec.getStatusMessage());
						} else if (fileSpec.getOpStatus() == FileSpecOpStatus.ERROR) {
							log.debug(fileSpec.getStatusMessage());
						}
					}
				}
			}

			// delete the temporary client
			P4Utils.deleteClient(server, client);
			server.disconnect();
		} catch (ConnectionException e) {
			log.error("Exception connecting to server", e);
		} catch (RequestException e) {
			log.error("Exception making reqquest", e);
		} catch (AccessException e) {
			e.printStackTrace();
		}
	}

	private IClient createTempClient(File source, String destination) {

		String p4User = server.getUserName();
		String tmpClientName = "webAuthP4" + p4User + "_" + source.getName() + UUID.randomUUID().toString();

		IClient client = new Client(server);
		client.setName(tmpClientName);
		client.setRoot(source.getParent());
		client.setOwnerName(p4User);
		client.setServer(server);

		// configureIfStream(client);

		ClientView mapping = new ClientView();
		mapping.addEntry(
				new ClientView.ClientViewMapping(0, destination, "//" + tmpClientName + "/" + source.getName()));
		client.setClientView(mapping);
		return client;
	}

	// Stream depots need extra configuration
	@SuppressWarnings("unused")
	private void configureIfStream(IClient client) {
		IDepot depot;
		try {
			depot = server.getDepot("StreamsDepot");
			System.out.println(depot.getDepotType());

			depot = server.getDepot("depot");
			System.out.println(depot.getDepotType());
			// TODO
			// client.setStream("//StreamsDepot/mainSampleData");
		} catch (P4JavaException e) {
			log.error("", e);
		}
	}

}
