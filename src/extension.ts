/**
 * A VS Code extension helps developers automatically manipulate Knative services on the Kubernetes cluster efficiently 
 * (e.g., deploying Knative services, retrieving details about Knative Services, deleting Knative services).
 * 
 * It currently supports the following commands:
 * 	- Deploy Knative Service: Deploy a Knative service to the Kubernetes cluster (specified by the input "registry name" and "image name").
 *  - Describe Knative Service: Print detailed information about a Knative service (specified by the input "service name").
 *  - Describe All Knative Services: Print detailed information about all Knative services.
 *  - Delete Knative Service: Delete a Knative Service (specified by the input "service name").
 *  - Test AKSM: Test whether the extension is working properly.
 * 
 * @author Dongzhi Zhang
 */

import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as util from 'util';
import * as fs from 'fs';

const EXTENSION_NAME = "automatic-knative-service-manipulation";
const OUTPUT_CHANNEL_NAME = "Automatic Knative Service Manipulation - Logs";

const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
const exec = util.promisify(childProcess.exec);

/**
 * This function is called when the extension is activated, responsible for registering commands.
 * 
 * @param {vscode.ExtensionContext} context - The context where the extension is executed.
 */
export function activate(context: vscode.ExtensionContext) {
	printLogInfo(`Extension "${EXTENSION_NAME}" is activated.\n`);

	// Command for testing if the extension is activated and working properly
	let cmdTestExtension = vscode.commands.registerCommand(`${EXTENSION_NAME}.testExtension`, callTestExtension);

	// Command for deploying a Knative service to Kubernetes cluster
	let cmdDeployService = vscode.commands.registerCommand(`${EXTENSION_NAME}.deployService`, callDeployKnativeService);

	// Command for printing detailed information about a specified Knative service
	let cmdDescribeService = vscode.commands.registerCommand(`${EXTENSION_NAME}.describeService`, callDescribeKnativeService);

	// Command for printing detailed information about all Knative services
	let cmdDescribeAllServices = vscode.commands.registerCommand(`${EXTENSION_NAME}.describeAllServices`, callDescribeAllKnativeServices);

	// Command for deleting a specified Knative service from the Kubernetes cluster
	let cmdDeleteService = vscode.commands.registerCommand(`${EXTENSION_NAME}.deleteService`, callDeleteKnativeService);

	context.subscriptions.push(cmdTestExtension, cmdDeployService, cmdDescribeService, cmdDescribeAllServices, cmdDeleteService);
}

/**
 * This function is called when the extension is deactivated.
 */
export function deactivate() { }

/* ======================== Command: Deploy Knative Service =========================*/

/**
 * This function is invoked when command "Deploy Knative Service" is executed.
 */
async function callDeployKnativeService() {
	vscode.window.showInformationMessage(`Start deploying the Knative service to Kubernetes cluster.`);
	const registryName = await vscode.window.showInputBox({
		prompt: "Please enter the name of the Docker image registry",
		placeHolder: "docker.io/username"
	});
	const imageName = await vscode.window.showInputBox({
		prompt: "Please enter the name of the Docker image",
		placeHolder: `${EXTENSION_NAME}`
	});
	if (!registryName || !imageName) {
		vscode.window.showErrorMessage("Deployment terminated: valid registry and image name must be provided.");
		return;
	}
	deployKnativeService(registryName, imageName);
}

/**
 * This function automates the process of deploying a Knative service to Kubernetes:
 * 	(1) Create the Dockerfile. 
 * 	(2) Creat the Knative service YAML configuration.
 * 	(3) Build the Docker image based on the Dockerfile.
 * 	(4) Push the built Docker image to the registry.
 * 	(5) Apply the YAML configuration and deploy the Knative service to the Kubernetes cluster.
 * 
 * @param registryName Name of the Docker image registry.
 * @param imageName Name of the Docker image.
 */
async function deployKnativeService(registryName: string, imageName: string) {
	// Should not continue to deploy if no valid folder is opened.
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage("No valid folder is opened.");
		return;
	}

	// Create the Dockerfile and the YAML file for Knative configuration 
	const workSpaceFolderPath = workspaceFolders[0].uri.fsPath;
	const dockerImageUri = `${registryName}/${imageName}`;
	await createDockerfile(workSpaceFolderPath);
	const knativeConfPath = `${workSpaceFolderPath}/${imageName}-service.yaml`;
	const knativeServiceName = `${imageName}-service`;
	await createKnativeConf(knativeConfPath, dockerImageUri, knativeServiceName);

	// Build the Docker image based on the Dockerfile and push the image to the registry
	const buildImageSuccess = await buildDockerImage(dockerImageUri, workSpaceFolderPath);
	if (!buildImageSuccess) {
		return;
	}
	const pushImageSuccess = await pushDockerImage(dockerImageUri);
	if (!pushImageSuccess) {
		return;
	}
	// Apply the YAML configuration and deploy the Knative service to Kubernetes 
	const applyConfSuccess = await applyKnativeConf(knativeConfPath);
	if (!applyConfSuccess) {
		return;
	}
	printLogInfo(`Knative service "${knativeServiceName}" is deployed.`);
	printLogInfo(`You can use command "Describe Knative Service" or "Describe All Knative Services" to check details.\n`);
}

/**
 * Create the Dockerfile needed.
 * 
 * @param workSpaceFolderPath Path of the directory where the Dockerfile should reside.
 */
async function createDockerfile(workSpaceFolderPath: string) {
	const dockerFilePath = `${workSpaceFolderPath}/Dockerfile`;
	vscode.window.showInformationMessage(`Creating the Dockerfile.`);
	printLogInfo("Start creating the Dockerfile.");
	const DOCKERFILE_CONTENT =
		`FROM python:3.8-slim
COPY . /app
WORKDIR /app
RUN pip3 install --upgrade pip
RUN pip3 install -r requirements.txt 
EXPOSE 5000
CMD ["python3", "app.py"]`;
	fs.writeFileSync(dockerFilePath, DOCKERFILE_CONTENT);
	vscode.window.showInformationMessage(`Succcessfully created the Dockerfile.`);
	printLogInfo("Successfully created the Dockerfile.\n");
}

/**
 * Build the docker image based on the specified Dockerfile.
 * 
 * @param dockerImageUri URI of the docker image to be built.
 * @param contextDir Directory where the Dockerfile resides.
 * @returns {Promise<boolean>} Whether successfully built the Docker image. 
 */
async function buildDockerImage(dockerImageUri: string, contextDir: string): Promise<boolean> {
	const buildImageCmd = `docker build -t ${dockerImageUri} .`;
	vscode.window.showInformationMessage(`Building the Docker image "${dockerImageUri}".`);
	printLogInfo("Start building the Docker image.");
	try {
		const { stdout, stderr } = await exec(buildImageCmd, { cwd: contextDir });
		vscode.window.showInformationMessage(`Succcessfully built the Docker image "${dockerImageUri}".`);
		printLogInfo(`Successfully built the Docker image "${dockerImageUri}".\n`);
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to build the Docker image "${dockerImageUri}".`);
		printLogInfo(`Failed to build the Docker image "${dockerImageUri}".`);
		console.error(error);
		return false;
	}
}

/**
 * Push the Docker image to the registry. 
 * 
 * @param dockerImageUri URI of the docker image to be built.
 * @returns {Promise<boolean>} Whether successfully pushed the Docker image. 
 */
async function pushDockerImage(dockerImageUri: string): Promise<boolean> {
	const pushImageCmd = `docker push ${dockerImageUri}`;
	vscode.window.showInformationMessage(`Pushing the Docker image.`);
	printLogInfo("Start pushing the Docker image.");
	try {
		const { stdout, stderr } = await exec(pushImageCmd);
		vscode.window.showInformationMessage(`Succcessfully pushed the Docker image "${dockerImageUri}".`);
		printLogInfo(`Successfully pushed the Docker image "${dockerImageUri}".\n`);
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to push the Docker image "${dockerImageUri}".`);
		printLogInfo(`Failed to push the Docker image "${dockerImageUri}".\n`);
		console.error(error);
		return false;
	}
}

/**
 * Create the Knative service YAML configuration for the deployment.
 * 
 * @param knativeConfPath Path of the Knative service YAML configuration.
 * @param dockerImageUri URI of the docker image to be built.
 * @param kantiveServiceName Name of the Knative service.
 */
async function createKnativeConf(knativeConfPath: string, dockerImageUri: string, knativeServiceName: string) {
	const knativeConfContent =
		`apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ${knativeServiceName}
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "4"
    spec:
      containers:
      - image: ${dockerImageUri}
        ports:
        - containerPort: 5000`;
	vscode.window.showInformationMessage(`Creating the Knative configuration.`);
	printLogInfo("Start creating the Knative configuration.");
	fs.writeFileSync(knativeConfPath, knativeConfContent);
	vscode.window.showInformationMessage(`Succcessfully created the Knative configuration.`);
	printLogInfo("Successfully created the Knative configuration.\n");
}

/**
 * Apply the Knative service configuration to deploy the service.
 * 
 * @param knativeConfPath Path of the Knative service YAML configuration.
 * @returns {Promise<boolean>} Whether successfully applied the Knative configuration. 
 */
async function applyKnativeConf(knativeConfPath: string): Promise<boolean> {
	const applyConfCmd = `kubectl apply -f ${knativeConfPath}`;
	vscode.window.showInformationMessage(`Applying the Knative configuration.`);
	printLogInfo("Start applying the Knative configuration.");
	try {
		const { stdout, stderr } = await exec(applyConfCmd);
		vscode.window.showInformationMessage(`Succcessfully deployed the Knative service to Kubernetes.`);
		printLogInfo("Succcessfully deployed the Knative service to Kubernetes.\n");
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to deploy the Knative service to Kubernetes.`);
		printLogInfo("Failed to deploy the Knative service to Kubernetes.\n");
		console.error(error);
		return false;
	}
}

/* ======================== Command: Describe Knative Service =======================*/

/**
 * This function is invoked when command "Describe Knative Service" is executed.
 */
async function callDescribeKnativeService() {
	const serviceName = await vscode.window.showInputBox({
		prompt: "Please enter the name of the Knative service",
		placeHolder: "xxx-service"
	});
	if (!serviceName) {
		vscode.window.showErrorMessage("Name of the Knative service must be provided.");
		printLogInfo("Name of the Knative service must be provided.\n");
		return;
	}
	describeKnativeService(serviceName);
}

/**
 * Print useful information about the deployed Knative service.
 * 
 * @param serviceName Name of the Knative service.
 */
async function describeKnativeService(serviceName: string) {
	const describeServiceCmd = `kubectl get ksvc ${serviceName} -o json`;
	try {
		// Retrieve the service information in JSON format
		const { stdout, stderr } = await exec(describeServiceCmd);
		printLogInfo("========== Deployed Knative Service Information ==========");
		const serviceInfoJson = JSON.parse(stdout);
		const name = serviceInfoJson.metadata.name;
		const status = serviceInfoJson.status.conditions.find((cond: any) => cond.type === "Ready").status;
		const type = serviceInfoJson.status.conditions.find((cond: any) => cond.type === "Ready").type;
		const url = serviceInfoJson.status.url;
		const latestCreatedRevisionName = serviceInfoJson.status.latestCreatedRevisionName;
		const latestReadyRevisionName = serviceInfoJson.status.latestReadyRevisionName;
		// Parse the JSON-format information into string representation
		let serviceInfo = `Service Name: ${name}\n`;
		serviceInfo += `- Status: ${status === "True" ? "Ready" : "Not Ready"}\n`;
		serviceInfo += `- Type: ${type}\n`;
		serviceInfo += `- URL: ${url}\n`;
		serviceInfo += `- Latest Created Revision Name: ${latestCreatedRevisionName}\n`;
		serviceInfo += `- Latest Ready Revision Name: ${latestReadyRevisionName}`;
		printLogInfo(serviceInfo);
		printLogInfo("==========================================================\n");
	} catch (error) {
		vscode.window.showErrorMessage("Failed to print Knative service information.");
		printLogInfo("Failed to print Knative service information.\n");
		console.error("Failed to print Knative service info: ", error);
	}
}

/* ======================== Command: Describe All Knative Services =======================*/

/**
 * This function is invoked when command "Describe All Knative Services" is executed.
 */
async function callDescribeAllKnativeServices() {
	describeAllKnativeServices();
}

/**
 * Print useful information about all Knative services.
 */
async function describeAllKnativeServices() {
	const describeServiceCmd = `kubectl get ksvc -o json`;
	try {
		// Retrieve the service information in JSON format
		const { stdout, stderr } = await exec(describeServiceCmd);
		printLogInfo("============ All Knative Services Information ============");
		const servicesInfoJson = JSON.parse(stdout);
		if (servicesInfoJson.items.length === 0) {
			vscode.window.showErrorMessage("No Knative service found.");
			printLogInfo("No Knative Service found.");
		} else {
			servicesInfoJson.items.forEach((serviceInfoJson: any) => {
				const name = serviceInfoJson.metadata.name;
				const status = serviceInfoJson.status.conditions.find((cond: any) => cond.type === "Ready").status;
				const type = serviceInfoJson.status.conditions.find((cond: any) => cond.type === "Ready").type;
				const url = serviceInfoJson.status.url;
				const latestCreatedRevisionName = serviceInfoJson.status.latestCreatedRevisionName;
				const latestReadyRevisionName = serviceInfoJson.status.latestReadyRevisionName;
				let serviceInfo = `Service Name: ${name}\n`;
				serviceInfo += `- Status: ${status === "True" ? "Ready" : "Not Ready"}\n`;
				serviceInfo += `- Type: ${type}\n`;
				serviceInfo += `- URL: ${url}\n`;
				serviceInfo += `- Latest Created Revision Name: ${latestCreatedRevisionName}\n`;
				serviceInfo += `- Latest Ready Revision Name: ${latestReadyRevisionName}`;
				printLogInfo(serviceInfo);
			});
		}
		printLogInfo("==========================================================\n");
	} catch (error) {
		vscode.window.showErrorMessage("Failed to print all Knative services information.");
		printLogInfo("Failed to print all Knative services information.\n");
		console.error("Failed to print all Knative services info: ", error);
	}
}

/* ======================== Command: Delete Knative Service =========================*/

/**
 * This function is invoked when command "Delete Knative Service" is executed.
 */
async function callDeleteKnativeService() {
	const serviceName = await vscode.window.showInputBox({
		prompt: "Please enter the name of the Knative service to be deleted",
		placeHolder: "xxx-service"
	});
	if (!serviceName) {
		vscode.window.showErrorMessage("Name of the Knative service must be provided.");
		printLogInfo("Name of the Knative service must be provided.\n");
		return;
	}
	deleteKnativeService(serviceName);
}

/**
 * Delete the specified Knative service.
 * 
 * @param serviceName Name of the Knative service to be deleted.
 */
async function deleteKnativeService(serviceName: string) {
	const deleteServiceCmd = `kubectl delete ksvc ${serviceName}`;
	vscode.window.showInformationMessage(`Deleting the Knative service ${serviceName}.`);
	printLogInfo(`Start deleting the Knative service ${serviceName}.`);
	try {
		const { stdout, stderr } = await exec(deleteServiceCmd);
		vscode.window.showInformationMessage(`Successfully deleted the Knative service: ${serviceName}.`);
		printLogInfo(`Successfully deleted the Knative service ${serviceName}.\n`);

	} catch (error) {
		vscode.window.showErrorMessage(`Failed to delete the Knative service: ${serviceName}.`);
		printLogInfo(`Failed to delete the Knative service: ${serviceName}.\n`);
		console.error(error);
	}
}


/* ===================================== Utils ======================================*/

/**
 * This function is invoked when command "Test AKSM" is executed.
 */
async function callTestExtension() {
	vscode.window.showInformationMessage(`Extension ${EXTENSION_NAME} is working properly.`);
	printLogInfo(`Extension ${EXTENSION_NAME} is working properly.\n`);
}

/**
 * Display the message in the user's terminal.
 * 
 * @param message Message to be displayed to the user.
 */
async function printLogInfo(message: string) {
	outputChannel.appendLine("[AKSM] " + message);
	outputChannel.show(true);
}
