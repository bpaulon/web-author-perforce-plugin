package com.oxygenxml.examples.perforce;

import java.io.InputStream;
import java.io.StringWriter;
import java.util.List;

import org.apache.commons.io.IOUtils;

import com.perforce.p4java.core.IDepot;
import com.perforce.p4java.core.file.FileSpecBuilder;
import com.perforce.p4java.core.file.FileSpecOpStatus;
import com.perforce.p4java.core.file.IFileSpec;
import com.perforce.p4java.exception.RequestException;
import com.perforce.p4java.option.server.GetDepotFilesOptions;
import com.perforce.p4java.server.IOptionsServer;
import com.perforce.p4java.server.callback.IProgressCallback;

/**
 * Simple P4Java file list and progress callback sample demo.
 * <p>
 * 
 * This example demonstrates a typical pattern used in P4Java to use and
 * retrieve lists of IFileSpec objects; it also demonstrates a very simple
 * progress callback implementation and associated usage.
 */

public class ListFilesDemo extends P4JavaDemo {

	public InputStream getFileAsStream(String depotPath) {
		try {
		IOptionsServer server = getOptionsServer(null, null);
		server.registerProgressCallback(new ProgressCallback());

		server.setUserName(userName);
		server.login(password);
		System.out.println("Depot files on Perforce server at URI '" + serverUri + "':");
		List<IFileSpec> fileList = server.getDepotFiles(FileSpecBuilder.makeFileSpecList(
				//"//..."
				"//StreamsDepot/mainSampleData/folderDiff/test9.txt"),
				new GetDepotFilesOptions());
		
		
		
		if (fileList != null) {
			for (IFileSpec fileSpec : fileList) {
				if (fileSpec != null) {
					if (fileSpec.getOpStatus() == FileSpecOpStatus.VALID) {
						InputStream is = fileSpec.getContents(true);
						System.out.println(" >" + readIntoString(is));
						System.out.println(formatFileSpec(fileSpec));
					} else {
						System.err.println(fileSpec.getStatusMessage());
					}
				}
			}
		}

		server.setCurrentClient(server.getClient(clientName));

	} catch (RequestException rexc) {
		System.err.println(rexc.getDisplayString());
		rexc.printStackTrace();
	} catch (Exception exc) {
		System.err.println(exc.getLocalizedMessage());
		exc.printStackTrace();
	}
	
	}
	
	public static void main(String[] args) {
		try {
			IOptionsServer server = getOptionsServer(null, null);
			server.registerProgressCallback(new ProgressCallback());

			server.setUserName(userName);
			server.login(password);
			System.out.println("Depot files on Perforce server at URI '" + serverUri + "':");
			List<IFileSpec> fileList = server.getDepotFiles(FileSpecBuilder.makeFileSpecList(
					//"//..."
					"//StreamsDepot/mainSampleData/folderDiff/test9.txt"),
					new GetDepotFilesOptions());
			
			IDepot depot = server.getDepot("StreamsDepot");
			System.out.println(depot.getDepotType());
			
			depot = server.getDepot("depot");
			System.out.println(depot.getDepotType());
			
			if (fileList != null) {
				for (IFileSpec fileSpec : fileList) {
					if (fileSpec != null) {
						if (fileSpec.getOpStatus() == FileSpecOpStatus.VALID) {
							InputStream is = fileSpec.getContents(true);
							System.out.println(" >" + readIntoString(is));
							System.out.println(formatFileSpec(fileSpec));
						} else {
							System.err.println(fileSpec.getStatusMessage());
						}
					}
				}
			}

			server.setCurrentClient(server.getClient(clientName));

		} catch (RequestException rexc) {
			System.err.println(rexc.getDisplayString());
			rexc.printStackTrace();
		} catch (Exception exc) {
			System.err.println(exc.getLocalizedMessage());
			exc.printStackTrace();
		}
	}

	protected static String readIntoString (InputStream is) throws Exception {
		StringWriter writer = new StringWriter();
		IOUtils.copy(is, writer,"UTF-8");
		String res = writer.toString();
		return res;
	}
	
	protected static String formatFileSpec(IFileSpec fileSpec) {
		return fileSpec.getDepotPathString();
	}

	
}
