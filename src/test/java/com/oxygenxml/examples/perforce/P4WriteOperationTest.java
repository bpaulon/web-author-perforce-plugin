package com.oxygenxml.examples.perforce;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.Charset;
import java.time.LocalDateTime;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class P4WriteOperationTest {

	@Rule
	public TemporaryFolder folder = new TemporaryFolder();

	// folder must exist
	String depotPath = "//depot/level1/";
	String serverUri = "perforce://192.168.1.108:1666";
	String filename = "test3.txt";

	@Test
	public void testPutFile() throws IOException {
		final File file = folder.newFile(filename);
		System.out.println(file.getAbsolutePath());

		writeContent(file);

		P4WriteOperation pd = new P4WriteOperation(serverUri + depotPath);
		pd.put(file, depotPath + filename, true);
	}

	@Test
	public void testWriteContent() throws IOException {
		String content = LocalDateTime.now().toString();
		byte[] contentBytes = content.getBytes(Charset.forName("UTF-8"));
		
		P4WriteOperation pd = new P4WriteOperation(serverUri + depotPath + filename);
		pd.write(contentBytes);
	}

	private void writeContent(File file) throws IOException {
		String content = LocalDateTime.now().toString();
		try (PrintWriter writer = new PrintWriter(file)) {
			writer.write(content);
			writer.flush();
		}

	}
}
