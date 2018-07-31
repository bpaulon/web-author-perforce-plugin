package com.oxygenxml.examples.perforce;

import java.io.InputStream;
import java.net.PasswordAuthentication;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;

import com.perforce.p4java.core.file.FileSpecBuilder;
import com.perforce.p4java.core.file.FileSpecOpStatus;
import com.perforce.p4java.core.file.IFileSpec;
import com.perforce.p4java.exception.P4JavaException;
import com.perforce.p4java.exception.RequestException;
import com.perforce.p4java.option.server.GetDepotFilesOptions;
import com.perforce.p4java.server.IOptionsServer;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class P4ReadOperation extends P4Operation {

	private IOptionsServer server;
	private String depotPath;
	
	private PasswordAuthentication credentials;

	public P4ReadOperation(String uriString, PasswordAuthentication credentials) {
		try {
			URI uri = new URI(uriString);
			this.serverUri = "p4java://" + uri.getHost() + ":" + uri.getPort();
			this.depotPath = uri.getPath();
			
			this.credentials = credentials;

			this.server = getOptionsServer(null, null);
			this.server.registerProgressCallback(new P4ProgressCallback());
		} catch (P4JavaException | URISyntaxException e) {
			log.error("Could not create read operation", e);
		}
	}

	public InputStream read() throws Exception {
		log.info("Working with server URI {}", serverUri);

		try {
			server.setUserName(credentials.getUserName());
			// must be connected to server in order to login
			server.connect();
			server.login(new String(credentials.getPassword()));

			List<IFileSpec> fileList = server.getDepotFiles(FileSpecBuilder.makeFileSpecList(depotPath),
					new GetDepotFilesOptions());

			InputStream is = null;
			if (fileList != null) {
				for (IFileSpec fileSpec : fileList) {
					if (fileSpec != null) {
						if (fileSpec.getOpStatus() == FileSpecOpStatus.VALID) {
							is = fileSpec.getContents(true);
							log.debug(formatFileSpec(fileSpec));
						} else {
							log.error(fileSpec.getStatusMessage());
						}
					}
				}
			}

			return is;

		} catch (RequestException rexc) {
			log.error(rexc.getDisplayString(), rexc);
			throw rexc;
		} catch (Exception e) {
			log.error(e.getLocalizedMessage(), e);
			throw e;
		}
		
		
	}

	protected static String formatFileSpec(IFileSpec fileSpec) {
		return fileSpec.getDepotPathString();
	}

}
