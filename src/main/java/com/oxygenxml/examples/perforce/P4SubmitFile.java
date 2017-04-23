package com.oxygenxml.examples.perforce;

import java.io.File;
import java.io.IOException;
import java.util.Date;
import java.util.List;
import java.util.UUID;

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
public class P4SubmitFile extends P4JavaDemo {

	public void put(File file, String depotPath, boolean overwrite) {
		try {
			IOptionsServer server = getOptionsServer(null, null);
			server.registerProgressCallback(new ProgressCallback());

			server.setUserName(userName);
			server.login(password);
			log.debug("Working server URI: {}", serverUri);
			
			//put(server, new File("C:\\proj\\oxygen\\temp\\test12.txt"), "//StreamsDepot/mainSampleData/folderDiff/test12.txt", true);
			//put(server, new File("C:\\proj\\oxygen\\temp\\depot\\test3.xml"), "//depot/test3.xml", true);
			
			put(server, file, depotPath, true);
		} catch (Exception e) {
			e.printStackTrace();
		}
		
	}
	
	public static void put(IOptionsServer server, File source, String destination, boolean overwrite) throws IOException {
		
		String p4User = server.getUserName();
		
		// create a temporary P4 client
		IClient client = buildTempClient(server, source, destination);
		
		String tmpClientName = client.getName();

		try {
			server.createClient(client);
			server.setCurrentClient(client);
		} catch (P4JavaException pexc) {
			log.error("Error creating perforce-client {} \n {}", tmpClientName, pexc.getMessage());
			throw new IOException("Error creating perforce-client " + tmpClientName + "\n" + pexc.getMessage());
		}
		log.error("\tcreated tempclient {}", tmpClientName);


		// check whether the target already exists in perforce (and is not deleted in head-revision)
		Boolean p4add = false;
		if (P4Utils.p4FileExists(server,destination)) {
			log.debug("File exists in perforce already: {}", destination);

			if (overwrite) {
				log.debug("updating {}", destination);
				p4add = false;	// no add, but edit in perforce
			} else {
				log.debug("Overwrite set to false, ignoring {}", source.getName());
				return;
			}
		}

		Changelist changeListImpl = new Changelist(
				IChangelist.UNKNOWN,
				client.getName(),
				p4User,
				ChangelistStatus.NEW,
				new Date(),
				"submitted by webapp author",
				false,
				(Server) server
		);

		try {
			IChangelist changelist = client.createChangelist(changeListImpl);

			if (p4add) {
				client.addFiles(
						FileSpecBuilder.makeFileSpecList(destination), false, changelist.getId(), null, false);
			} else {
				// "flush" the file (sync -k)
				client.sync(FileSpecBuilder.makeFileSpecList(destination),false,false,true,false);
				// open for edit
				client.editFiles(
						FileSpecBuilder.makeFileSpecList(destination), false, false, changelist.getId(), null);
				//FileSpecBuilder.makeFileSpecList(destination), null);
			}

			changelist.update();
			changelist.refresh();

			List<IFileSpec> submitFiles = changelist.submit(false);
			if (submitFiles != null) {
				for (IFileSpec fileSpec : submitFiles) {
					if (fileSpec != null) {
						if (fileSpec.getOpStatus() == FileSpecOpStatus.VALID) {
							log.info("submitted: {}", fileSpec.getDepotPathString());
						} else if (fileSpec.getOpStatus() == FileSpecOpStatus.INFO){
							log.debug(fileSpec.getStatusMessage());
						} else if (fileSpec.getOpStatus() == FileSpecOpStatus.ERROR){
							log.debug(fileSpec.getStatusMessage());
						}
					}
				}
			}
			
			P4Utils.deleteClient(server, client);
		} catch (ConnectionException e) {
			e.printStackTrace();
		} catch (RequestException e) {
			e.printStackTrace();
		} catch (AccessException e) {
			e.printStackTrace();
		} 
	}

	private IClient buildTempClient(IOptionsServer server, File source, String destination) {
		
		String p4User = server.getUserName();
		String tmpClientName = "ivyp4_" + p4User + "_" + source.getName() + UUID.randomUUID().toString();
		
		IClient	client = new Client(server);
		client.setName(tmpClientName);
		client.setRoot(source.getParent());
		client.setOwnerName(p4User);
		client.setServer(server);

		//configureIfStreamClient(server, client);

		ClientView mapping = new ClientView();
		mapping.addEntry(new ClientView.ClientViewMapping(0,destination, "//" + tmpClientName + "/" + source.getName()));
		client.setClientView(mapping);
		return client;
	}
	
	private void configureIfStreamClient(IOptionsServer server, IClient client) {
		IDepot depot;
		try {
			depot = server.getDepot("StreamsDepot");
			System.out.println(depot.getDepotType());

			depot = server.getDepot("depot");
			System.out.println(depot.getDepotType());
			// TODO che
			// client.setStream("//StreamsDepot/mainSampleData");
		} catch (P4JavaException e) {
			// FIXME - handle exception
			log.error("", e);
		}
	}
	 
}
